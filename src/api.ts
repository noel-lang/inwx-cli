import { TOTP, Secret } from 'otpauth';
import type {
  Contact,
  ContactListResData,
  CreateContactInput,
  CreateContactResData,
  CreateDomainInput,
  CreateDomainResData,
  CreateRecordInput,
  DnsRecord,
  DomainCheckResData,
  DomainCheckResult,
  DomainInfoResData,
  DomainListEntry,
  DomainListResData,
  DomainPriceEntry,
  DomainPricesResData,
  DomrobotResponse,
  Env,
  LoginResData,
  NameserverInfoResData,
  UpdateRecordInput,
} from './types.js';

const ENDPOINTS: Record<Env, string> = {
  prod: 'https://api.domrobot.com/jsonrpc/',
  ote: 'https://api.ote.domrobot.com/jsonrpc/',
};

export class ApiError extends Error {
  code?: number;
  reason?: unknown;
  raw?: DomrobotResponse;

  constructor(res: DomrobotResponse | undefined, method?: string) {
    const msg = res?.msg || 'Unbekannter API-Fehler';
    super(`INWX ${method ? method + ' ' : ''}fehlgeschlagen: ${msg} (Code ${res?.code})`);
    this.name = 'ApiError';
    this.code = res?.code;
    this.reason = res?.reason;
    this.raw = res;
  }
}

/** 2FA erforderlich, aber kein Code/Secret vorhanden. */
export class TfaRequiredError extends Error {
  readonly tfaRequired = true;
  constructor() {
    super('2FA ist aktiv, aber kein TOTP-Code oder -Secret vorhanden.');
    this.name = 'TfaRequiredError';
  }
}

/**
 * Erzeugt einen TOTP-Code (RFC 6238, SHA-1, 6 Stellen, 30 s).
 * @param secret Base32-Secret aus der 2FA-Einrichtung.
 * @param timestamp Optionaler Zeitpunkt in ms (für Tests); Default = jetzt.
 */
export function generateTotp(secret: string, timestamp?: number): string {
  const totp = new TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(String(secret).replace(/\s+/g, '').toUpperCase()),
  });
  return timestamp === undefined ? totp.generate() : totp.generate({ timestamp });
}

interface LoginExtra {
  totpSecret?: string;
  totpCode?: string;
}

export interface LoginResult {
  tfaUsed: boolean;
  account: string;
}

export class Domrobot {
  readonly env: Env;
  readonly url: string;
  private cookie: string | null = null;

  constructor(env: Env = 'prod') {
    if (!ENDPOINTS[env]) throw new Error(`Unbekannte Umgebung: ${env}`);
    this.env = env;
    this.url = ENDPOINTS[env];
  }

  async call<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<DomrobotResponse<T>> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: JSON.stringify({ method, params: { lang: 'en', ...params } }),
    });

    // Session-Cookie(s) einsammeln und für Folge-Requests behalten.
    const headers = res.headers as Headers & { getSetCookie?: () => string[] };
    const setCookies = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
    if (setCookies.length) {
      this.cookie = setCookies.map((c) => c.split(';')[0]!.trim()).join('; ');
    }

    let data: DomrobotResponse<T>;
    try {
      data = (await res.json()) as DomrobotResponse<T>;
    } catch {
      throw new Error(`Unerwartete Antwort von INWX (HTTP ${res.status}).`);
    }
    return data;
  }

  /** Login inkl. optionaler 2FA (account.login + account.unlock). */
  async login(user: string, pass: string, extra: LoginExtra = {}): Promise<LoginResult> {
    const r = await this.call<LoginResData>('account.login', { user, pass });
    if (r.code !== 1000) throw new ApiError(r, 'Login');

    const tfa = r.resData?.tfa;
    const tfaRequired = Boolean(tfa && tfa !== '0');
    let tfaUsed = false;

    if (tfaRequired) {
      let tan = extra.totpCode;
      if (!tan && extra.totpSecret) tan = generateTotp(extra.totpSecret);
      if (!tan) throw new TfaRequiredError();
      const u = await this.call('account.unlock', { tan });
      if (u.code !== 1000) throw new ApiError(u, '2FA-Unlock');
      tfaUsed = true;
    }

    return { tfaUsed, account: user };
  }

  logout(): Promise<DomrobotResponse> {
    return this.call('account.logout');
  }

  /* ── DNS-Records ── */

  async listRecords(domain: string): Promise<DnsRecord[]> {
    const r = await this.call<NameserverInfoResData>('nameserver.info', { domain });
    if (r.code !== 1000) throw new ApiError(r, 'nameserver.info');
    return r.resData?.record ?? [];
  }

  async createRecord({ domain, name, type, content, ttl = 3600, prio }: CreateRecordInput) {
    const params: Record<string, unknown> = { domain, name, type, content, ttl };
    if (prio !== undefined && prio !== null && prio !== '') params.prio = Number(prio);
    const r = await this.call('nameserver.createRecord', params);
    if (r.code !== 1000) throw new ApiError(r, 'createRecord');
    return r.resData;
  }

  async updateRecord(id: number | string, { content, ttl, prio }: UpdateRecordInput) {
    const params: Record<string, unknown> = { id: Number(id) };
    if (content !== undefined) params.content = content;
    if (ttl !== undefined) params.ttl = ttl;
    if (prio !== undefined && prio !== null && prio !== '') params.prio = Number(prio);
    const r = await this.call('nameserver.updateRecord', params);
    if (r.code !== 1000) throw new ApiError(r, 'updateRecord');
    return r.resData;
  }

  async deleteRecord(id: number | string) {
    const r = await this.call('nameserver.deleteRecord', { id: Number(id) });
    if (r.code !== 1000) throw new ApiError(r, 'deleteRecord');
    return r.resData;
  }

  /* ── Domains ── */

  /** Verfügbarkeitsprüfung (READ-ONLY). Nimmt einen oder mehrere Namen. */
  async checkDomains(names: string[]): Promise<DomainCheckResult[]> {
    const r = await this.call<DomainCheckResData>('domain.check', { domain: names });
    if (r.code !== 1000) throw new ApiError(r, 'domain.check');
    return r.resData?.domain ?? [];
  }

  /** Preisliste für eine oder mehrere TLDs. */
  async getPrices(tlds: string[]): Promise<DomainPriceEntry[]> {
    const r = await this.call<DomainPricesResData>('domain.getPrices', { tld: tlds });
    if (r.code !== 1000) throw new ApiError(r, 'domain.getPrices');
    return r.resData?.price ?? r.resData?.pricelist ?? [];
  }

  async listDomains(): Promise<DomainListEntry[]> {
    const r = await this.call<DomainListResData>('domain.list', { pagelimit: 1000 });
    if (r.code !== 1000) throw new ApiError(r, 'domain.list');
    return r.resData?.domain ?? [];
  }

  async domainInfo(domain: string): Promise<DomainInfoResData> {
    const r = await this.call<DomainInfoResData>('domain.info', { domain });
    if (r.code !== 1000) throw new ApiError(r, 'domain.info');
    if (!r.resData) throw new ApiError(r, 'domain.info');
    return r.resData;
  }

  /**
   * Registriert eine Domain (domain.create).
   * Mit `testing: true` validiert die API nur, ohne zu registrieren.
   */
  async createDomain(input: CreateDomainInput): Promise<CreateDomainResData> {
    const params: Record<string, unknown> = {
      domain: input.domain,
      registrant: input.registrant,
    };
    if (input.period) params.period = input.period;
    if (input.admin !== undefined) params.admin = input.admin;
    if (input.tech !== undefined) params.tech = input.tech;
    if (input.billing !== undefined) params.billing = input.billing;
    if (input.ns && input.ns.length) params.ns = input.ns;
    if (input.renewalMode) params.renewalMode = input.renewalMode;
    if (input.testing) params.testing = true;

    const r = await this.call<CreateDomainResData>('domain.create', params);
    if (r.code !== 1000) throw new ApiError(r, 'domain.create');
    return r.resData ?? {};
  }

  /* ── Kontakte ── */

  async listContacts(): Promise<Contact[]> {
    const r = await this.call<ContactListResData>('contact.list', { pagelimit: 1000 });
    if (r.code !== 1000) throw new ApiError(r, 'contact.list');
    return r.resData?.contact ?? [];
  }

  async createContact(input: CreateContactInput): Promise<number> {
    const params: Record<string, unknown> = {
      type: input.type,
      name: input.name,
      street: input.street,
      pc: input.pc,
      city: input.city,
      cc: input.cc,
      voice: input.voice,
      email: input.email,
    };
    if (input.org) params.org = input.org;
    if (input.sp) params.sp = input.sp;
    if (input.fax) params.fax = input.fax;
    if (input.testing) params.testing = true;

    const r = await this.call<CreateContactResData>('contact.create', params);
    if (r.code !== 1000) throw new ApiError(r, 'contact.create');
    if (!r.resData?.id) throw new ApiError(r, 'contact.create');
    return r.resData.id;
  }
}

/** Wandelt einen Host ('@', 'www', 'mail') in einen FQDN für die Zone um. */
export function toFqdn(name: string, domain: string): string {
  const n = String(name).trim();
  if (n === '' || n === '@' || n === domain) return domain;
  if (n.endsWith('.' + domain)) return n;
  return `${n}.${domain}`;
}
