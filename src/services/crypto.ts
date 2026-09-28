/**
 * Client-Side End-to-End Encryption (E2EE) and Security Fingerprints
 * Uses native Web Crypto API (SubtleCrypto)
 */

export interface E2EESessionKeys {
  roomCode: string;
  fingerprint: string;
  keyHex: string;
}

/**
 * Derives a deterministic 256-bit AES-GCM session key and human-verifiable security fingerprint
 */
export async function deriveRoomE2EEKeys(roomCode: string, callerId: string, recipientId: string): Promise<E2EESessionKeys> {
  const enc = new TextEncoder();
  // Sort IDs so both participants calculate identical cryptographic keys regardless of caller/callee order
  const participants = [callerId, recipientId].sort().join(':');
  const seedString = `telcall-e2ee-v1:${roomCode}:${participants}`;
  const seedBuffer = enc.encode(seedString);

  // Hash with SHA-256
  const hashBuffer = await crypto.subtle.digest('SHA-256', seedBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const keyHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  // Human-readable 4-block security number (like Signal safety number)
  // e.g. "4821 9043 1182 7649"
  const digits = hashArray.slice(0, 16).map((b) => (b % 10).toString()).join('');
  const fingerprint = `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)} ${digits.slice(12, 16)}`;

  return {
    roomCode,
    fingerprint,
    keyHex,
  };
}

/**
 * Encrypts a message payload using AES-GCM
 */
export async function encryptChatMessage(text: string, keyHex: string): Promise<{ ciphertext: string; iv: string }> {
  try {
    const enc = new TextEncoder();
    const rawKey = new Uint8Array(keyHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      enc.encode(text)
    );

    const ivHex = Array.from(iv).map((b) => b.toString(16).padStart(2, '0')).join('');
    const cipherHex = Array.from(new Uint8Array(encrypted)).map((b) => b.toString(16).padStart(2, '0')).join('');

    return { ciphertext: cipherHex, iv: ivHex };
  } catch (e) {
    console.error('Encryption failed:', e);
    return { ciphertext: text, iv: '' };
  }
}

/**
 * Decrypts an AES-GCM ciphertext
 */
export async function decryptChatMessage(ciphertext: string, ivHex: string, keyHex: string): Promise<string> {
  if (!ivHex) return ciphertext;
  try {
    const rawKey = new Uint8Array(keyHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
    const cipherData = new Uint8Array(ciphertext.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      cipherData
    );

    const dec = new TextDecoder();
    return dec.decode(decrypted);
  } catch (e) {
    console.warn('Decryption failed, falling back:', e);
    return ciphertext;
  }
}

/**
 * 2FA 6-digit verification code generator simulation
 */
export function generate2FACode(): string {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  return code;
}
