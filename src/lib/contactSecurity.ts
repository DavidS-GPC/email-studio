import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const ENCRYPTION_PREFIX = "enc:v1";

function getEncryptionKey() {
  const keyValue = process.env.CONTACT_DATA_ENCRYPTION_KEY;

  if (!keyValue) {
    throw new Error("CONTACT_DATA_ENCRYPTION_KEY is not configured");
  }

  const key = Buffer.from(keyValue, "base64");
  if (key.length !== 32) {
    throw new Error("CONTACT_DATA_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }

  return key;
}

function getHashPepper() {
  const pepper = process.env.CONTACT_DATA_HASH_PEPPER;

  if (!pepper) {
    throw new Error("CONTACT_DATA_HASH_PEPPER is not configured");
  }

  return pepper;
}

export function isEncryptedText(value: string) {
  return value.startsWith(`${ENCRYPTION_PREFIX}:`);
}

export function encryptText(value: string): string {
  if (!value) {
    return value;
  }

  if (isEncryptedText(value)) {
    return value;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${ENCRYPTION_PREFIX}:${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptText(value: string): string {
  if (!value) {
    return value;
  }

  if (!isEncryptedText(value)) {
    return value;
  }

  const parts = value.split(":");
  if (parts.length !== 5) {
    throw new Error("Encrypted payload format is invalid");
  }

  const iv = Buffer.from(parts[2], "base64");
  const authTag = Buffer.from(parts[3], "base64");
  const encrypted = Buffer.from(parts[4], "base64");

  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

export function encryptNullable(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return encryptText(value);
}

export function decryptNullable(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return decryptText(value);
}

export function hashContactEmail(email: string) {
  return createHmac("sha256", getHashPepper()).update(email.trim().toLowerCase()).digest("hex");
}
