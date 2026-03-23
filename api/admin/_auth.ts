import crypto from "crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const COOKIE_NAME = "admin_token";
const MAX_AGE_SECONDS = 8 * 60 * 60; // 8 hours

function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || "Rayleigh11";
}

function getSigningSecret(): string {
  return process.env.ADMIN_TOKEN_SECRET || getAdminPassword();
}

export function createToken(): string {
  const payload = JSON.stringify({
    admin: true,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
  });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSigningSecret())
    .update(payloadB64)
    .digest("hex");
  return `${payloadB64}.${sig}`;
}

export function verifyToken(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sig] = parts;

  const expectedSig = crypto
    .createHmac("sha256", getSigningSecret())
    .update(payloadB64)
    .digest("hex");

  if (sig.length !== expectedSig.length) return false;
  const valid = crypto.timingSafeEqual(
    Buffer.from(sig, "hex"),
    Buffer.from(expectedSig, "hex"),
  );
  if (!valid) return false;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (!payload.admin) return false;
    if (typeof payload.exp !== "number") return false;
    if (payload.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}

export function setAuthCookie(res: VercelResponse): void {
  const token = createToken();
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

export function isAdmin(req: VercelRequest): boolean {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return false;
  return verifyToken(token);
}

export function validatePassword(password: string): boolean {
  const expected = getAdminPassword();
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
