export const MAX_MESSAGE_BYTES = 16 * 1024;
export const BURN_EXPIRIES = ["1h", "24h", "7d"] as const;
export type BurnExpiry = (typeof BURN_EXPIRIES)[number];

export interface BurnCiphertext {
  ciphertext: string;
  iv: string;
}

export interface BurnEnvelope extends BurnCiphertext {
  version: 1;
  tokenDigest: string;
}

const base64UrlCharacter = /[^A-Za-z0-9_-]/;
const aesTagBytes = 16;

export function isBurnExpiry(value: unknown): value is BurnExpiry {
  return BURN_EXPIRIES.some((expiry) => expiry === value);
}

export function isBurnCredential(value: unknown): value is string {
  return typeof value === "string" &&
    value.length === 43 &&
    /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value);
}

export function parseBurnFragment(fragment: string) {
  const [version, token, key, extra] = fragment.split(".");
  if (version !== "#v1" || extra !== undefined || !isBurnCredential(token) || !isBurnCredential(key)) {
    return null;
  }

  return { token, key };
}

export function readBurnCiphertext(value: unknown): BurnCiphertext | null {
  if (typeof value !== "object" || value === null) return null;

  const { ciphertext, iv } = value as Record<string, unknown>;
  if (typeof ciphertext !== "string" || typeof iv !== "string") return null;
  if (iv.length !== 16 || base64UrlCharacter.test(iv)) return null;

  const encryptedBytes = Math.floor(ciphertext.length * 3 / 4);
  if (
    encryptedBytes <= aesTagBytes ||
    encryptedBytes > MAX_MESSAGE_BYTES + aesTagBytes ||
    ciphertext.length % 4 === 1 ||
    base64UrlCharacter.test(ciphertext)
  ) {
    return null;
  }

  return { ciphertext, iv };
}
