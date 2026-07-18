import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

function getSameOriginDestination(requestUrl: URL, requestedPath: string | null) {
  const fallback = new URL("/workspaces", requestUrl);
  const candidate = requestedPath ?? "/workspaces";

  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) {
    return fallback;
  }

  try {
    const destination = new URL(candidate, requestUrl);
    return destination.origin === requestUrl.origin ? destination : fallback;
  } catch {
    return fallback;
  }
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const destination = getSameOriginDestination(requestUrl, requestUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const [workspaceClaim, platformClaim, loginRecord] = await Promise.all([
        supabase.rpc("claim_bootstrap_admin"),
        supabase.rpc("claim_platform_admin"),
        supabase.rpc("record_user_login"),
      ]);

      const setupFailures = [
        { operation: "workspace-claim", error: workspaceClaim.error },
        { operation: "platform-claim", error: platformClaim.error },
        { operation: "login-record", error: loginRecord.error },
      ].filter((entry) => entry.error);

      if (setupFailures.length > 0) {
        console.error("Post-login account setup was incomplete", {
          failures: setupFailures.map((entry) => ({
            operation: entry.operation,
            code: entry.error?.code ?? null,
            message: entry.error?.message ?? null,
          })),
        });
      }

      return NextResponse.redirect(destination);
    }

    console.error("Supabase OAuth callback failed", {
      message: error.message,
      requestOrigin: requestUrl.origin,
      hasCode: Boolean(code),
    });
  }

  return NextResponse.redirect(new URL("/login?error=callback", request.url));
}
