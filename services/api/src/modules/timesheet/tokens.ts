import { randomBytes, createHash } from "node:crypto";

// Same shape as modules/identity/tokens.ts's refresh token: a
// high-entropy random value, hashed at rest (never the raw value stored).
// This one is also single-purpose and single-use — see routes.ts.
export function generateApprovalToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashApprovalToken(token) };
}

export function hashApprovalToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
