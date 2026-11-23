import { EXAM_CONFIG } from '@/src/config/examConfig';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// XOR-masked key material so plaintext access code is never present literally in client source.
const MASKED_CIPHER_BYTES = [14, 16, 17, 14, 119, 29, 15, 8, 15, 119, 104, 106, 104, 108];
const CIPHER_MASK = 0x5a;

function getStudentCipherPassphrase(): string {
  return String.fromCharCode(...MASKED_CIPHER_BYTES.map((b) => b ^ CIPHER_MASK));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function sha256Hex(input: string): Promise<string> {
  const data = textEncoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyTeacherCode(enteredCode: string): Promise<boolean> {
  const normalized = enteredCode.trim();
  if (!normalized) return false;
  const hash = await sha256Hex(normalized);
  return hash === EXAM_CONFIG.teacherAccessSha256;
}

async function deriveAesGcmKey(
  passphrase: string,
  salt: Uint8Array,
  usages: KeyUsage[]
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    usages
  );
}

export interface EncryptedEnvelope {
  v: string;
  alg: 'AES-256-GCM';
  kdf: 'PBKDF2-SHA256';
  iter: number;
  salt: string;
  iv: string;
  ct: string;
}

export async function encryptExamResult(plainObject: unknown): Promise<{
  envelopeString: string;
  rekapCiphertext: string;
  integritySha256: string;
}> {
  const passphrase = getStudentCipherPassphrase();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesGcmKey(passphrase, salt, ['encrypt']);

  const serialized = JSON.stringify(plainObject);
  const integritySha256 = await sha256Hex(serialized);

  const wrappedPlain = JSON.stringify({
    integritySha256,
    data: plainObject,
  });

  const cipherBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
    },
    key,
    textEncoder.encode(wrappedPlain)
  );

  const envelope: EncryptedEnvelope = {
    v: EXAM_CONFIG.encryptionVersion,
    alg: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    iter: 100000,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(cipherBuffer)),
  };

  const envelopeString = JSON.stringify(envelope);
  const rekapCiphertext = bytesToBase64(textEncoder.encode(envelopeString));

  return {
    envelopeString,
    rekapCiphertext,
    integritySha256,
  };
}

export async function decryptExamResult<T>(
  input: string,
  teacherPassphrase: string
): Promise<{ data: T; integritySha256: string; integrityValid: boolean }> {
  const trimmed = input.trim();
  let envelopeJson = trimmed;

  // Support either raw JSON envelope or Base64-encoded envelope string (rekap_jawaban)
  if (!trimmed.startsWith('{')) {
    try {
      envelopeJson = textDecoder.decode(base64ToBytes(trimmed));
    } catch {
      throw new Error('Format ciphertext tidak valid.');
    }
  }

  let parsed: EncryptedEnvelope;
  try {
    parsed = JSON.parse(envelopeJson) as EncryptedEnvelope;
  } catch {
    throw new Error('Struktur JSON terenkripsi tidak valid.');
  }

  if (!parsed?.salt || !parsed?.iv || !parsed?.ct) {
    throw new Error('Atribut enkripsi AES-256-GCM tidak lengkap.');
  }

  const salt = base64ToBytes(parsed.salt);
  const iv = base64ToBytes(parsed.iv);
  const ct = base64ToBytes(parsed.ct);

  const key = await deriveAesGcmKey(teacherPassphrase.trim(), salt, ['decrypt']);

  let decryptedBuffer: ArrayBuffer;
  try {
    decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as BufferSource,
      },
      key,
      ct as BufferSource
    );
  } catch {
    throw new Error('Dekripsi gagal. Pastikan kode akses guru dan ciphertext benar.');
  }

  const decryptedText = textDecoder.decode(new Uint8Array(decryptedBuffer));
  const unwrapped = JSON.parse(decryptedText) as {
    integritySha256: string;
    data: T;
  };

  const recomputedHash = await sha256Hex(JSON.stringify(unwrapped.data));
  const integrityValid = recomputedHash === unwrapped.integritySha256;

  return {
    data: unwrapped.data,
    integritySha256: unwrapped.integritySha256,
    integrityValid,
  };
}
