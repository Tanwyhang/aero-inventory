import { redirect } from "next/navigation";
import { cookies } from "next/headers";

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

export async function getAvailableWorkspaces(): Promise<WorkspaceMembership[]> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError && !isMissingSessionError(userError)) {
    console.error("Workspace session lookup failed", {
      name: userError.name,
      status: userError.status,
      message: userError.message,
    });
    throw new Error("Unable to verify the current session.");
  }

  if (!userData.user) return [];

  const { error: bootstrapError } = await supabase.rpc("claim_bootstrap_admin");

  if (bootstrapError) {
    console.error("Workspace bootstrap check failed", {
      userId: userData.user.id,
      code: bootstrapError.code,
      message: bootstrapError.message,
    });
    throw new Error("Unable to prepare workspace access.");
  }

  const { data, error } = await supabase.rpc("get_my_workspaces");

  if (error) {
    console.error("Workspace list lookup failed", {
      userId: userData.user.id,
      code: error.code,
      message: error.message,
    });
    throw new Error("Unable to load workspaces.");
  }

  if (!data) return [];

  return (data as WorkspaceMembership[]).map(toWorkspace).filter((workspace) => workspace.status === "active");
}

export async function getCurrentMembership(): Promise<Membership | null> {
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
}

export async function requireMembership() {
  const membership = await getCurrentMembership();

  if (!membership) {
    redirect("/workspaces");
  }

  return membership;
}
