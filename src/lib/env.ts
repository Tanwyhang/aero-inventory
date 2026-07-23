export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }

  return { url, key };
}

export function getSupabaseServiceRoleEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return { url, key };
}

export function getAppUrl(fallback = "http://localhost:3000") {
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || vercelUrl || fallback).replace(/\/$/, "");
}

export function isPasswordLoginEnabled() {
  return process.env.AERO_ENABLE_PASSWORD_LOGIN === "true";
}

export function getAeroSuperAdminPassword() {
  return process.env.AERO_SUPER_ADMIN_PASSWORD || "aerothebest";
}

export function getAeroSuperAdminCookieSecret() {
  return process.env.AERO_SUPER_ADMIN_COOKIE_SECRET || getAeroSuperAdminPassword();
}
