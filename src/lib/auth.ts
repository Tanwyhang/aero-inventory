import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { MemberRole, Membership, WorkspaceMembership } from "@/types/database";

export const WORKSPACE_COOKIE = "aero:workspace-id";

function toMemberRole(role: string): MemberRole {
  if (role === "admin" || role === "viewer") return role;
  return "staff";
}

function toWorkspace(row: WorkspaceMembership): WorkspaceMembership {
  return {
    ...row,
    role: toMemberRole(row.role),
    status: row.status === "disabled" ? "disabled" : row.status === "invited" ? "invited" : "active",
  };
}

export function isMissingSessionError(error: { name?: string; code?: string } | null) {
  return error?.name === "AuthSessionMissingError" || error?.code === "session_not_found";
}

const getVerifiedClaimsForRequest = cache(async () => {
  const supabase = await createClient();
  return supabase.auth.getClaims();
});

export async function getVerifiedClaims() {
  return getVerifiedClaimsForRequest();
}

const getRequestAccessTokenForRequest = cache(async () => {
  const [{ data: claimsData, error: claimsError }, supabase] = await Promise.all([
    getVerifiedClaims(),
    createClient(),
  ]);

  if (claimsError || !claimsData?.claims.sub) return null;

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) return null;
  return sessionData.session?.access_token ?? null;
});

export async function getRequestAccessToken() {
  return getRequestAccessTokenForRequest();
}

export async function getSelectedWorkspaceId() {
  return (await cookies()).get(WORKSPACE_COOKIE)?.value ?? null;
}

export async function setSelectedWorkspaceCookie(organizationId: string) {
  (await cookies()).set(WORKSPACE_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearSelectedWorkspaceCookie() {
  (await cookies()).delete(WORKSPACE_COOKIE);
}

const getAvailableWorkspacesForRequest = cache(async (): Promise<WorkspaceMembership[]> => {
  const supabase = await createClient();
  const { data: claimsData, error: userError } = await getVerifiedClaims();

  if (userError && !isMissingSessionError(userError)) {
    console.error("Workspace session lookup failed", {
      name: userError.name,
      status: userError.status,
      message: userError.message,
    });
    throw new Error("Unable to verify the current session.");
  }

  const userId = claimsData?.claims.sub;
  if (!userId) return [];

  const { error: bootstrapError } = await supabase.rpc("claim_bootstrap_admin");

  if (bootstrapError) {
    if (/verified google email required/i.test(bootstrapError.message ?? "")) {
      const { data, error } = await supabase.rpc("get_my_workspaces");

      if (error) {
        console.error("Workspace list lookup failed", {
          userId,
          code: error.code,
          message: error.message,
        });
        throw new Error("Unable to load workspaces.");
      }

      return ((data ?? []) as WorkspaceMembership[]).map(toWorkspace).filter((workspace) => workspace.status === "active");
    }

    console.error("Workspace bootstrap check failed", {
      userId,
      code: bootstrapError.code,
      message: bootstrapError.message,
    });
    throw new Error("Unable to prepare workspace access.");
  }

  const { data, error } = await supabase.rpc("get_my_workspaces");

  if (error) {
    console.error("Workspace list lookup failed", {
      userId,
      code: error.code,
      message: error.message,
    });
    throw new Error("Unable to load workspaces.");
  }

  if (!data) return [];

  return (data as WorkspaceMembership[]).map(toWorkspace).filter((workspace) => workspace.status === "active");
});

export async function getAvailableWorkspaces(): Promise<WorkspaceMembership[]> {
  return getAvailableWorkspacesForRequest();
}

const getCurrentMembershipForRequest = cache(async (): Promise<Membership | null> => {
  const workspaces = await getAvailableWorkspaces();

  if (workspaces.length === 0) return null;

  const selectedWorkspaceId = await getSelectedWorkspaceId();
  const row = workspaces.find((workspace) => workspace.organization_id === selectedWorkspaceId)
    ?? workspaces.find((workspace) => workspace.is_last_workspace)
    ?? workspaces[0];

  return {
    organization_id: row.organization_id,
    organization_name: row.organization_name,
    organization_icon: row.organization_icon,
    organization_slug: row.organization_slug,
    role: toMemberRole(row.role),
    user_email: row.user_email ?? "",
    full_name: row.full_name,
    workspaces,
  };
});

export async function getCurrentMembership(): Promise<Membership | null> {
  return getCurrentMembershipForRequest();
}

export async function requireMembership() {
  const membership = await getCurrentMembership();

  if (!membership) {
    redirect("/workspaces");
  }

  return membership;
}
