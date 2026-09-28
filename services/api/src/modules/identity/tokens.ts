import { randomBytes, createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const MFA_CHALLENGE_TTL_SECONDS = 5 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface AccessTokenClaims {
  sub: string;
  practitionerId: string | null;
  purpose: "access";
}

export function signAccessToken(claims: Omit<AccessTokenClaims, "purpose">): string {
  if (!env.jwtSecretKey) {
    throw new Error("JWT_SECRET_KEY is not configured");
  }
  return jwt.sign({ ...claims, purpose: "access" }, env.jwtSecretKey, {
    algorithm: "HS256",
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  if (!env.jwtSecretKey) {
    throw new Error("JWT_SECRET_KEY is not configured");
  }
  // Pin the algorithm so a token signed with "none" or an attacker-chosen
  // algorithm can never be accepted (the classic JWT algorithm-confusion
  // bypass).
  const claims = jwt.verify(token, env.jwtSecretKey, { algorithms: ["HS256"] }) as AccessTokenClaims;
  // The purpose discriminator stops an MFA challenge token (below) — same
  // signing key, same algorithm, otherwise structurally similar — from
  // ever being accepted as a real, fully-authenticated access token.
  if (claims.purpose !== "access") {
    throw new Error("Not an access token");
  }
  return claims;
}

export interface MfaChallengeClaims {
  sub: string;
  purpose: "mfa_challenge";
}

// Issued after a correct password when MFA is enabled, in place of real
// session tokens — proves "password was correct" without granting any
// access until the TOTP/backup code step also succeeds. Deliberately
// short-lived and single-purpose (see the purpose check in
// verifyAccessToken and verifyMfaChallengeToken).
export function signMfaChallengeToken(userId: string): string {
  if (!env.jwtSecretKey) {
    throw new Error("JWT_SECRET_KEY is not configured");
  }
  return jwt.sign({ sub: userId, purpose: "mfa_challenge" }, env.jwtSecretKey, {
    algorithm: "HS256",
    expiresIn: MFA_CHALLENGE_TTL_SECONDS,
  });
}

export function verifyMfaChallengeToken(token: string): MfaChallengeClaims {
  if (!env.jwtSecretKey) {
    throw new Error("JWT_SECRET_KEY is not configured");
  }
  const claims = jwt.verify(token, env.jwtSecretKey, { algorithms: ["HS256"] }) as MfaChallengeClaims;
  if (claims.purpose !== "mfa_challenge") {
    throw new Error("Not an MFA challenge token");
  }
  return claims;
}

// Refresh tokens are opaque, high-entropy random strings, not JWTs — only
// their SHA-256 hash is ever stored, so a database read alone can't be used
// to mint a session (mirrors the hashed-at-rest pattern used for
// Timesheet.ApprovalToken).
export function generateRefreshToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
