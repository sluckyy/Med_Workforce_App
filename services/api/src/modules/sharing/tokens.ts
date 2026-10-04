import { randomBytes, randomInt, createHash } from "node:crypto";

// Same high-entropy, hashed-at-rest shape as every other single-purpose
// token in this app (RefreshToken, ApprovalToken).
export function generateShareToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashShareToken(token) };
}

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// A 6-digit OTP is low-entropy by design (a human has to read and type
// it), so it's hashed with bcrypt (slow, brute-force-resistant) via
// modules/identity/password.ts rather than the fast sha256 used for the
// high-entropy share token itself.
export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}
