/**
 * Zentrale Typdefinitionen für die DomRobot-API und die CLI.
 * Die Feldnamen entsprechen exakt der INWX-DomRobot-Doku (JSON-RPC).
 */

export type Env = 'prod' | 'ote';

/** Generische DomRobot-Antworthülle. `code` 1000 = Erfolg. */
export interface DomrobotResponse<T = unknown> {
  code: number;
  msg?: string;
  reason?: string;
  resData?: T;
}

/* ── account ── */
export interface LoginResData {
  /** '0' oder undefined = kein 2FA; sonst aktive 2FA-Methode. */
  tfa?: string;
}

/* ── nameserver (DNS) ── */
export interface DnsRecord {
  id: number;
  name: string;
  type: string;
  content: string;
  ttl: number;
  prio?: number;
}

export interface NameserverInfoResData {
  record?: DnsRecord[];
}

export interface CreateRecordInput {
  domain: string;
  name: string;
  type: string;
  content: string;
  ttl?: number;
  prio?: number | string;
}

export interface UpdateRecordInput {
  content?: string;
  ttl?: number;
  prio?: number | string;
}

/* ── domain.check ── */
export interface DomainCheckResult {
  domain: string;
  /** 0 = vergeben, 1 = frei, 2 = premium, -1 = ungültig. */
  avail: number;
  status?: string;
  reason?: string;
  checktime?: number;
  checkmethod?: string;
  name?: string;
  tld?: string;
  price?: number;
}

export interface DomainCheckResData {
  domain?: DomainCheckResult[];
}

/* ── domain.getPrices ── */
export interface DomainPriceEntry {
  tld: string;
  currency?: string;
  createPrice?: number;
  monthlyCreatePrice?: number;
  transferPrice?: number;
  renewalPrice?: number;
  monthlyRenewalPrice?: number;
  updatePrice?: number;
  tradePrice?: number;
  trusteePrice?: number;
  vat?: number;
}

export interface DomainPricesResData {
  price?: DomainPriceEntry[];
  pricelist?: DomainPriceEntry[];
}

/* ── domain.list / domain.info ── */
export interface DomainListEntry {
  roId: number;
  domain: string;
   'domain-ace'?: string;
  status?: string;
  crDate?: string;
  exDate?: string;
  registrant?: number;
  ns?: string[];
}

export interface DomainListResData {
  count?: number;
  domain?: DomainListEntry[];
}

export interface DomainInfoResData {
  roId: number;
  domain: string;
  'domain-ace'?: string;
  period?: string;
  crDate?: string;
  exDate?: string;
  upDate?: string;
  transferLock?: boolean;
  status?: string;
  registrant?: number;
  admin?: number;
  tech?: number;
  billing?: number;
  ns?: string[];
  verificationStatus?: string;
}

/* ── domain.create ── */
export interface CreateDomainInput {
  domain: string;
  /** Registrierungsdauer, z. B. "1Y". */
  period?: string;
  registrant: number;
  admin?: number;
  tech?: number;
  billing?: number;
  ns?: string[];
  renewalMode?: string;
  /** true = nur Validierung, keine echte Registrierung. */
  testing?: boolean;
}

export interface CreateDomainResData {
  roId?: number;
  price?: number;
  currency?: string;
}

/* ── contact ── */
export type ContactType = 'person' | 'org' | 'role';

export interface Contact {
  roId: number;
  id: number;
  type: string;
  name: string;
  org?: string;
  street?: string;
  city?: string;
  pc?: string;
  cc?: string;
  sp?: string;
  voice?: string;
  fax?: string;
  email?: string;
}

export interface ContactListResData {
  count?: number;
  contact?: Contact[];
}

export interface CreateContactInput {
  type: ContactType;
  name: string;
  org?: string;
  street: string;
  pc: string;
  city: string;
  sp?: string;
  cc: string;
  voice: string;
  fax?: string;
  email: string;
  testing?: boolean;
}

export interface CreateContactResData {
  id: number;
}

/* ── config / profile ── */
export interface StoredProfile {
  user: string;
  /** base64-kodiert. */
  pass: string;
  /** base64-kodiert. */
  totpSecret?: string;
  savedAt?: string;
}

export interface ConfigFile {
  profiles: Partial<Record<Env, StoredProfile>>;
}

export interface ResolvedProfile {
  user?: string;
  pass?: string;
  totpSecret?: string;
  fromEnv: boolean;
  savedAt?: string;
}
