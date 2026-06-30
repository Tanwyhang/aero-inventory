"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { clearSelectedWorkspaceCookie, getSelectedWorkspaceId, requireMembership, setSelectedWorkspaceCookie } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const workspaceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  icon: z.string().trim().max(40).optional(),
  defaultCountry: z.enum(["MY", "TH"]).default("MY"),
});

const workspaceIdentitySchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  icon: z.string().trim().min(1).max(40).optional(),
  returnTo: z.string().trim().startsWith("/").default("/workspaces"),
});

const inviteSchema = z.object({
  email: z.string().trim().email().max(254),
  role: z.enum(["admin", "staff"]).default("staff"),
});

const tokenSchema = z.object({ token: z.string().trim().min(16).max(200) });

const deleteWorkspaceSchema = z.object({ organizationId: z.string().uuid() });

const memberRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "staff"]),
});

const memberStatusSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["active", "disabled"]),
});

function revalidateWorkspaceRoutes() {
  revalidatePath("/");
  revalidatePath("/partner-share");
  revalidatePath("/restock");
  revalidatePath("/sku");
  revalidatePath("/reports");
  revalidatePath("/workspaces");
}

export async function switchWorkspaceAction(formData: FormData) {
  const organizationId = String(formData.get("organizationId") ?? "");
  if (!z.string().uuid().safeParse(organizationId).success) redirect("/workspaces?error=workspace");

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_last_workspace", { p_organization_id: organizationId });
  if (error) redirect(`/workspaces?error=${encodeURIComponent(error.message)}`);

  await setSelectedWorkspaceCookie(organizationId);
  revalidateWorkspaceRoutes();
  redirect("/");
}

export async function createWorkspaceAction(formData: FormData) {
  const parsed = workspaceSchema.safeParse({
    name: formData.get("name"),
    icon: formData.get("icon") || "Paw",
    defaultCountry: formData.get("defaultCountry") || "MY",
  });
  if (!parsed.success) redirect("/workspaces?error=workspace-name");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_workspace", {
    p_name: parsed.data.name,
    p_icon: parsed.data.icon || "Paw",
    p_default_country: parsed.data.defaultCountry,
  });

  if (error || !data) redirect(`/workspaces?error=${encodeURIComponent(error?.message ?? "Workspace creation failed")}`);

  await setSelectedWorkspaceCookie(data);
  revalidateWorkspaceRoutes();
  redirect("/");
}

export async function acceptWorkspaceInviteAction(formData: FormData) {
  const parsed = tokenSchema.safeParse({ token: formData.get("token") });
  if (!parsed.success) redirect("/workspaces?error=invite-code");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_workspace_invite", { p_token: parsed.data.token });
  if (error || !data) redirect(`/workspaces?error=${encodeURIComponent(error?.message ?? "Invite failed")}`);

  await setSelectedWorkspaceCookie(data);
  revalidateWorkspaceRoutes();
  redirect("/");
}

export async function updateWorkspaceIdentityAction(formData: FormData) {
  const membership = await requireMembership();
  const parsed = workspaceIdentitySchema.safeParse({
    organizationId: formData.get("organizationId"),
    name: formData.get("name"),
    icon: formData.get("icon") || undefined,
    returnTo: formData.get("returnTo") || "/workspaces",
  });
  if (!parsed.success) redirect("/workspaces?error=workspace-name");

  const targetWorkspace = membership.workspaces.find((workspace) => workspace.organization_id === parsed.data.organizationId);
  if (targetWorkspace?.role !== "admin") redirect("/workspaces?error=admin");

  const supabase = await createClient();
  const updateValues = parsed.data.icon
    ? { name: parsed.data.name, icon: parsed.data.icon }
    : { name: parsed.data.name };
  const { error } = await supabase
    .from("organizations")
    .update(updateValues)
    .eq("id", parsed.data.organizationId);

  if (error) redirect(`/workspaces?error=${encodeURIComponent(error.message)}`);

  revalidateWorkspaceRoutes();
  redirect(parsed.data.returnTo);
}

export async function deleteWorkspaceAction(formData: FormData) {
  const membership = await requireMembership();
  const parsed = deleteWorkspaceSchema.safeParse({ organizationId: formData.get("organizationId") });
  if (!parsed.success) redirect("/workspaces?error=workspace");

  const targetWorkspace = membership.workspaces.find((workspace) => workspace.organization_id === parsed.data.organizationId);
  if (targetWorkspace?.role !== "admin") redirect("/workspaces?error=admin");

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", parsed.data.organizationId)
    .select("id")
    .single();

  if (error) redirect(`/workspaces?error=${encodeURIComponent(error.message)}`);

  const selectedWorkspaceId = await getSelectedWorkspaceId();
  const deletedSelectedWorkspace = selectedWorkspaceId === parsed.data.organizationId || membership.organization_id === parsed.data.organizationId;

  if (deletedSelectedWorkspace) {
    const nextWorkspace = membership.workspaces.find((workspace) => workspace.organization_id !== parsed.data.organizationId);
    if (nextWorkspace) await setSelectedWorkspaceCookie(nextWorkspace.organization_id);
    else await clearSelectedWorkspaceCookie();
  }

  revalidateWorkspaceRoutes();
  redirect("/workspaces");
}

export async function inviteWorkspaceMemberAction(formData: FormData) {
  const membership = await requireMembership();
  if (membership.role !== "admin") redirect("/workspaces?error=admin");

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role") || "staff",
  });
  if (!parsed.success) redirect("/workspaces?error=invite-email");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_invite_workspace_member", {
    p_organization_id: membership.organization_id,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
    p_expires_in_days: 14,
  });

  if (error || !data?.[0]) redirect(`/workspaces?error=${encodeURIComponent(error?.message ?? "Invite failed")}`);

  const invite = data[0];
  revalidatePath("/workspaces");
  redirect(`/workspaces?invite=${encodeURIComponent(invite.token)}&email=${encodeURIComponent(invite.email)}`);
}

export async function updateWorkspaceMemberRoleAction(formData: FormData) {
  const membership = await requireMembership();
  if (membership.role !== "admin") redirect("/workspaces?error=admin");

  const parsed = memberRoleSchema.safeParse({ userId: formData.get("userId"), role: formData.get("role") });
  if (!parsed.success) redirect("/workspaces?error=member-role");

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_workspace_member_role", {
    p_organization_id: membership.organization_id,
    p_user_id: parsed.data.userId,
    p_role: parsed.data.role,
  });

  if (error) redirect(`/workspaces?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/workspaces");
  redirect("/workspaces");
}

export async function updateWorkspaceMemberStatusAction(formData: FormData) {
  const membership = await requireMembership();
  if (membership.role !== "admin") redirect("/workspaces?error=admin");

  const parsed = memberStatusSchema.safeParse({ userId: formData.get("userId"), status: formData.get("status") });
  if (!parsed.success) redirect("/workspaces?error=member-status");

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_workspace_member_status", {
    p_organization_id: membership.organization_id,
    p_user_id: parsed.data.userId,
    p_status: parsed.data.status,
  });

  if (error) redirect(`/workspaces?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/workspaces");
  redirect("/workspaces");
}

export async function revokeWorkspaceInviteAction(formData: FormData) {
  const membership = await requireMembership();
  if (membership.role !== "admin") redirect("/workspaces?error=admin");

  const inviteId = String(formData.get("inviteId") ?? "");
  if (!z.string().uuid().safeParse(inviteId).success) redirect("/workspaces?error=invite");

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_revoke_workspace_invite", { p_invite_id: inviteId });
  if (error) redirect(`/workspaces?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/workspaces");
  redirect("/workspaces");
}
