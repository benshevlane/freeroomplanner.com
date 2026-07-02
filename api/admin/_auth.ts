import crypto from "crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const COOKIE_NAME = "admin_token";
const MAX_AGE_SECONDS = 8 * 60 * 60; // 8 hours

function getSigningSecret(): string {
  const secret = process.env.ADMIN_TOKEN_SECRET || process.env.ADMIN_PASSWORD;
  if (!secret) {
    // Fail closed: never fall back to a secret baked into (public) source.
    throw new Error("ADMIN_TOKEN_SECRET (or ADMIN_PASSWORD) is not configured");
  }
  return secret;
}

export function createToken(email: string): string {
  const payload = JSON.stringify({
    admin: true,
    email,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
  });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSigningSecret())
    .update(payloadB64)
    .digest("hex");
  return `${payloadB64}.${sig}`;
}

export function verifyToken(token: string): { valid: true; email: string } | { valid: false } {
  const parts = token.split(".");
  if (parts.length !== 2) return { valid: false };
  const [payloadB64, sig] = parts;

  let secret: string;
  try {
    secret = getSigningSecret();
  } catch {
    return { valid: false }; // no secret configured -> treat as unauthenticated
  }

  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(payloadB64)
    .digest("hex");

  if (sig.length !== expectedSig.length) return { valid: false };
  const sigMatch = crypto.timingSafeEqual(
    Buffer.from(sig, "hex"),
    Buffer.from(expectedSig, "hex"),
  );
  if (!sigMatch) return { valid: false };

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (!payload.admin) return { valid: false };
    if (typeof payload.exp !== "number") return { valid: false };
    if (payload.exp < Math.floor(Date.now() / 1000)) return { valid: false };
    if (typeof payload.email !== "string") return { valid: false };
    return { valid: true, email: payload.email };
  } catch {
    return { valid: false };
  }
}

export function setAuthCookie(res: VercelResponse, email: string): void {
  const token = createToken(email);
  const secure = process.env.NODE_ENV === "production";
  const parts = [
    `${COOKIE_NAME}=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    `Path=/api/admin`,
    `Max-Age=${MAX_AGE_SECONDS}`,
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

export function clearAuthCookie(res: VercelResponse): void {
  const secure = process.env.NODE_ENV === "production";
  const parts = [
    `${COOKIE_NAME}=`,
    "HttpOnly",
    "SameSite=Lax",
    `Path=/api/admin`,
    `Max-Age=0`,
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

export function isAdmin(req: VercelRequest): { authenticated: true; email: string } | { authenticated: false } {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return { authenticated: false };
  const result = verifyToken(token);
  if (!result.valid) return { authenticated: false };
  return { authenticated: true, email: result.email };
}
