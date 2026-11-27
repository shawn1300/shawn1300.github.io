import { MAX_MESSAGE_BYTES, type BurnCiphertext, type BurnEnvelope } from "./protocol";

function encodeBase64Url(bytes: Uint8Array) {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function decodeBase64Url(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

export async function hashBurnToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", decodeBase64Url(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function encryptBurnMessage(message: string) {
  const plaintext = new TextEncoder().encode(message);
  if (!message.trim() || plaintext.byteLength > MAX_MESSAGE_BYTES) {
    throw new RangeError("Invalid plaintext size");
  }

  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const token = encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

  const envelope: BurnEnvelope = {
    version: 1,
    ciphertext: encodeBase64Url(new Uint8Array(encrypted)),
    iv: encodeBase64Url(iv),
    tokenDigest: await hashBurnToken(token),
  };

  return { envelope, fragment: `#v1.${token}.${encodeBase64Url(rawKey)}` };
}

export async function decryptBurnMessage(message: BurnCiphertext, encodedKey: string) {
  const key = await crypto.subtle.importKey("raw", decodeBase64Url(encodedKey), "AES-GCM", false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64Url(message.iv) },
    key,
    decodeBase64Url(message.ciphertext),
  );

  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(plaintext);
}
