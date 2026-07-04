import { TOTP, Secret } from 'otpauth';

const ENDPOINTS = {
  prod: 'https://api.domrobot.com/jsonrpc/',
  ote: 'https://api.ote.domrobot.com/jsonrpc/',
};

export class ApiError extends Error {
  constructor(res, method) {
    const msg = res?.msg || 'Unbekannter API-Fehler';
    super(`INWX ${method ? method + ' ' : ''}fehlgeschlagen: ${msg} (Code ${res?.code})`);
    this.code = res?.code;
    this.reason = res?.reason;
    this.raw = res;
  }
}

export function generateTotp(secret) {
  const totp = new TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(String(secret).replace(/\s+/g, '').toUpperCase()),
  });
  return totp.generate();
}

export class Domrobot {
  constructor(env = 'prod') {
    if (!ENDPOINTS[env]) throw new Error(`Unbekannte Umgebung: ${env}`);
    this.env = env;
    this.url = ENDPOINTS[env];
    this.cookie = null;
  }

  async call(method, params = {}) {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: JSON.stringify({ method, params: { lang: 'en', ...params } }),
    });

    // Session-Cookie(s) einsammeln und für Folge-Requests behalten
    const setCookies =
      typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    if (setCookies.length) {
      this.cookie = setCookies.map((c) => c.split(';')[0].trim()).join('; ');
    }

    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error(`Unerwartete Antwort von INWX (HTTP ${res.status}).`);
    }
    return data;
  }

  /**
   * Login inkl. optionaler 2FA.
   * @returns {{ tfaUsed: boolean, account: string }}
   */
  async login(user, pass, { totpSecret, totpCode } = {}) {
    const r = await this.call('account.login', { user, pass });
    if (r.code !== 1000) throw new ApiError(r, 'Login');

    const tfa = r.resData?.tfa;
    const tfaRequired = tfa && tfa !== '0';
    let tfaUsed = false;

    if (tfaRequired) {
      let tan = totpCode;
      if (!tan && totpSecret) tan = generateTotp(totpSecret);
      if (!tan) {
        const err = new Error('2FA ist aktiv, aber kein TOTP-Code oder -Secret vorhanden.');
        err.tfaRequired = true;
        throw err;
      }
      const u = await this.call('account.unlock', { tan });
      if (u.code !== 1000) throw new ApiError(u, '2FA-Unlock');
      tfaUsed = true;
    }

    return { tfaUsed, account: user };
  }

  logout() {
    return this.call('account.logout');
  }

  /** Alle DNS-Records einer Zone. */
  async listRecords(domain) {
    const r = await this.call('nameserver.info', { domain });
    if (r.code !== 1000) throw new ApiError(r, 'nameserver.info');
    return r.resData?.record ?? [];
  }

  async createRecord({ domain, name, type, content, ttl = 3600, prio }) {
    const params = { domain, name, type, content, ttl };
    if (prio !== undefined && prio !== null && prio !== '') params.prio = Number(prio);
    const r = await this.call('nameserver.createRecord', params);
    if (r.code !== 1000) throw new ApiError(r, 'createRecord');
    return r.resData;
  }

  async updateRecord(id, { content, ttl, prio }) {
    const params = { id: Number(id) };
    if (content !== undefined) params.content = content;
    if (ttl !== undefined) params.ttl = ttl;
    if (prio !== undefined && prio !== null && prio !== '') params.prio = Number(prio);
    const r = await this.call('nameserver.updateRecord', params);
    if (r.code !== 1000) throw new ApiError(r, 'updateRecord');
    return r.resData;
  }

  async deleteRecord(id) {
    const r = await this.call('nameserver.deleteRecord', { id: Number(id) });
    if (r.code !== 1000) throw new ApiError(r, 'deleteRecord');
    return r.resData;
  }
}

/** Wandelt einen Host ('@', 'www', 'mail') in einen FQDN für die Zone um. */
export function toFqdn(name, domain) {
  const n = String(name).trim();
  if (n === '' || n === '@' || n === domain) return domain;
  if (n.endsWith('.' + domain) || n === domain) return n;
  return `${n}.${domain}`;
}
