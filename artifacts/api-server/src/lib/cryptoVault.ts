import crypto from "crypto";
import fs from "fs/promises";

const ALGO = "aes-256-gcm";
const VERSION = "vault:v1";
const DEV_FALLBACK_KEY = "pooledit-local-development-data-vault-key-change-before-production";

function rawKeyMaterial(): string {
  const key = process.env.DATA_ENCRYPTION_KEY || process.env.BACKUP_ENCRYPTION_KEY;
  if (!key && process.env.NODE_ENV === "production") {
    throw new Error("DATA_ENCRYPTION_KEY is required in production to protect persisted data");
  }
  if (!key) {
    console.warn("[security] DATA_ENCRYPTION_KEY is not set. Using development-only encrypted vault fallback.");
  }
  return key || DEV_FALLBACK_KEY;
}

function keyBuffer(): Buffer {
  const raw = rawKeyMaterial().trim();
  if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  try {
    const b64 = Buffer.from(raw, "base64");
    if (b64.length === 32) return b64;
  } catch {
    // Fall through to hash derivation.
  }
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptedExtension(filename: string): string {
  return filename.endsWith(".enc") ? filename : `${filename}.enc`;
}

export function encryptText(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, keyBuffer(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    version: VERSION,
    alg: ALGO,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  });
}

export function decryptText(payload: string): string {
  const parsed = JSON.parse(payload) as { version?: string; alg?: string; iv?: string; tag?: string; data?: string };
  if (parsed.version !== VERSION || parsed.alg !== ALGO || !parsed.iv || !parsed.tag || !parsed.data) {
    throw new Error("Invalid encrypted vault payload");
  }
  const decipher = crypto.createDecipheriv(ALGO, keyBuffer(), Buffer.from(parsed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parsed.data, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export async function writeEncryptedFile(filePath: string, plainText: string): Promise<void> {
  await fs.writeFile(encryptedExtension(filePath), encryptText(plainText), "utf-8");
}

export async function readEncryptedFile(filePath: string): Promise<string> {
  const text = await fs.readFile(encryptedExtension(filePath), "utf-8");
  return decryptText(text);
}

export async function appendEncryptedLine(filePath: string, line: string): Promise<void> {
  const encryptedPath = encryptedExtension(filePath);
  let existing = "";
  try {
    existing = decryptText(await fs.readFile(encryptedPath, "utf-8"));
  } catch {
    try {
      existing = await fs.readFile(filePath, "utf-8");
    } catch {
      existing = "";
    }
  }
  await fs.writeFile(encryptedPath, encryptText(existing + line), "utf-8");
}

export function encryptionStatus() {
  return {
    enabled: true,
    algorithm: ALGO,
    keyConfigured: !!(process.env.DATA_ENCRYPTION_KEY || process.env.BACKUP_ENCRYPTION_KEY),
    productionRequiresKey: true,
  };
}

export function assertDataEncryptionReady() {
  rawKeyMaterial();
}
