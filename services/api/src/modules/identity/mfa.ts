import { randomBytes } from "node:crypto";
import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import { hashPassword, verifyPassword } from "./password.js";

const ISSUER = "Medical Workforce Passport";
const BACKUP_CODE_COUNT = 8;

export function generateTotpSecret(): string {
  return generateSecret();
}

export async function totpQrCodeDataUrl(email: string, secret: string): Promise<string> {
  const otpauthUrl = generateURI({ issuer: ISSUER, label: email, secret });
  return QRCode.toDataURL(otpauthUrl);
}

export async function verifyTotpCode(code: string, secret: string): Promise<boolean> {
  try {
    const result = await verify({ secret, token: code });
    return result.valid;
  } catch {
    // Throws on a malformed token (wrong length, non-numeric) rather than
    // returning false — treat that the same as "wrong code".
    return false;
  }
}

// Plaintext codes are returned to the caller exactly once (at enrollment
// confirmation); only their bcrypt hashes are ever persisted.
export function generateBackupCodes(): string[] {
  return Array.from({ length: BACKUP_CODE_COUNT }, () => {
    const raw = randomBytes(5).toString("hex").toUpperCase(); // 10 hex chars
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((code) => hashPassword(code)));
}

// Consumes (returns the remaining set, minus the matched hash) a valid
// backup code — each one works exactly once. Returns null if the code
// doesn't match any remaining hash.
export async function consumeBackupCode(
  code: string,
  hashedCodes: string[],
): Promise<string[] | null> {
  for (let i = 0; i < hashedCodes.length; i++) {
    if (await verifyPassword(code, hashedCodes[i])) {
      return [...hashedCodes.slice(0, i), ...hashedCodes.slice(i + 1)];
    }
  }
  return null;
}
