import { randomBytes, createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface AccessTokenClaims {
  sub: string;
  practitionerId: string | null;
}

export function signAccessToken(claims: AccessTokenClaims): string {
  if (!env.jwtSecretKey) {
    throw new Error("JWT_SECRET_KEY is not configured");
  }
  return jwt.sign(claims, env.jwtSecretKey, {
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
  return jwt.verify(token, env.jwtSecretKey, { algorithms: ["HS256"] }) as AccessTokenClaims;
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
