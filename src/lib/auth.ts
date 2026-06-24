import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import type { Membership, WorkspaceMembership } from "@/types/database";

export const WORKSPACE_COOKIE = "aero:workspace-id";

function toWorkspace(row: WorkspaceMembership): WorkspaceMembership {
  return {
    ...row,
    role: row.role === "admin" ? "admin" : "staff",
    status: row.status === "disabled" ? "disabled" : row.status === "invited" ? "invited" : "active",
  };
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

  if (userError || !userData.user) return [];

  await supabase.rpc("claim_bootstrap_admin");

  const { data, error } = await supabase.rpc("get_my_workspaces");
  if (error || !data) return [];

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
    role: row.role === "admin" ? "admin" : "staff",
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
