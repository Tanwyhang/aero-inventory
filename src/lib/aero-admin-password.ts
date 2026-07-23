import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

import { getAeroSuperAdminCookieSecret, getAeroSuperAdminPassword } from "@/lib/env";

const AERO_ADMIN_COOKIE = "aero:super-admin";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

function sign(value: string) {
  return createHmac("sha256", getAeroSuperAdminCookieSecret()).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function isAeroSuperAdminPassword(value: string) {
  return safeEqual(value, getAeroSuperAdminPassword());
}

export async function setAeroSuperAdminPasswordSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = String(expiresAt);
  const token = `${payload}.${sign(payload)}`;

  (await cookies()).set(AERO_ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/aero-admin",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function hasAeroSuperAdminPasswordSession() {
  const token = (await cookies()).get(AERO_ADMIN_COOKIE)?.value;
  if (!token) return false;

  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return false;

  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && expiresAt > Math.floor(Date.now() / 1000);
}
