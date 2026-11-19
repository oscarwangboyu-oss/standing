/**
 * Random ids, tokens and hashes. WebCrypto only (globalThis.crypto), so the same code runs in
 * Node, on Vercel and in tests.
 */
import { ID_BYTES, RECOVERY_CODE, TOKEN_BYTES } from './config';

const encoder = new TextEncoder();

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytes;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function hex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
}

/** SHA-256 of a string, as 64 hex characters. Tokens and recovery codes are stored only like this. */
export async function sha256Hex(text: string): Promise<string> {
  return hex(await sha256(text));
}

/** A random id of 128 bits, URL-safe. Used for users, sessions and consent rows. */
export function randomId(): string {
  return base64Url(randomBytes(ID_BYTES));
}

/** A device token of 256 bits. Returned to the device once; the server keeps its hash. */
export function newDeviceToken(): string {
  return base64Url(randomBytes(TOKEN_BYTES));
}

/** A recovery code such as "7K2QF-0M9XA-R4TBN-C81ZD": 100 bits, grouped for reading. */
export function newRecoveryCode(): string {
  const { alphabet, length, group } = RECOVERY_CODE;
  // 32 symbols: the low 5 bits of a random byte pick one without bias.
  const chars = Array.from(randomBytes(length), (b) => alphabet[b & 31]);
  const groups: string[] = [];
  for (let i = 0; i < length; i += group) groups.push(chars.slice(i, i + group).join(''));
  return groups.join('-');
}

/**
 * The form of a recovery code that is hashed: upper case, without spaces and dashes, with the
 * look-alikes O, I and L mapped to 0 and 1. Returns null when what is left is not a code.
 */
export function normalizeRecoveryCode(input: string): string | null {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replaceAll('O', '0')
    .replaceAll('I', '1')
    .replaceAll('L', '1');
  if (cleaned.length !== RECOVERY_CODE.length) return null;
  for (const ch of cleaned) if (!RECOVERY_CODE.alphabet.includes(ch)) return null;
  return cleaned;
}

/**
 * Compares two secrets without leaking where they differ: both are hashed first, so the
 * comparison always runs over 32 bytes whatever the lengths of the inputs.
 */
export async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
  return diff === 0;
}
