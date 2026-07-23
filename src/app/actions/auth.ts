"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { clearSelectedWorkspaceCookie } from "@/lib/auth";
import { isPasswordLoginEnabled } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

async function getRequestOrigin() {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");

  if (origin) return origin;

  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const origin = await getRequestOrigin();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  });

  if (error || !data.url) {
    redirect("/login?error=oauth");
  }

  redirect(data.url);
}

export async function signInWithPassword(formData: FormData) {
  if (!isPasswordLoginEnabled()) {
    redirect("/login?error=password-disabled");
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/login?error=password");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect("/login?error=password");
  }

  await supabase.rpc("record_user_login");
  redirect("/workspaces");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  await clearSelectedWorkspaceCookie();
  redirect("/login");
}
