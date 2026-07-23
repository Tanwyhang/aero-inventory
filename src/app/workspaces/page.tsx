import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ChevronDown, Pencil, Plus, ShieldCheck, Trash2, UserPlus } from "lucide-react";

import {
  acceptWorkspaceInviteAction,
  createWorkspaceAction,
  deleteWorkspaceAction,
  inviteWorkspaceMemberAction,
  revokeWorkspaceInviteAction,
  switchWorkspaceAction,
  updateWorkspaceIdentityAction,
  updateWorkspaceMemberRoleAction,
  updateWorkspaceMemberStatusAction,
} from "@/app/actions/workspaces";
import { AddWorkspaceShortcutButton } from "@/components/add-workspace-shortcut-button";
import { FluidEntrySurface } from "@/components/fluid-entry-surface";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { CopyInviteLinkButton, WorkspaceActionButton } from "@/components/workspace-action-button";
import { getAvailableWorkspaces, getRequestAccessToken, getSelectedWorkspaceId, getVerifiedClaims, isMissingSessionError } from "@/lib/auth";
import { getCachedWorkspaceAdministration } from "@/lib/cached-data";
import { getAppUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { WorkspaceInviteRow, WorkspaceMemberRow, WorkspaceSeatUsageRow } from "@/types/database";

const inputClassName = "h-11 rounded-xl bg-white text-sm font-semibold";

function workspaceErrorMessage(code?: string) {
  if (!code) return null;
  if (code === "admin") return "Admin access is required for that workspace action.";
  if (code === "invite-code" || code === "invite" || code === "invite-email") return "The workspace invite is invalid or no longer available.";
  if (code === "workspace" || code === "workspace-name") return "Check the workspace details and try again.";
  if (code === "member-role" || code === "member-status") return "The staff update could not be completed. Refresh and try again.";
  if (code === "last-admin") return "Every workspace must keep at least one active Admin. Promote or enable another Admin first.";
  if (code === "existing-member") return "That Google account is already an active or pending member of this workspace.";
  if (code === "invite-action") return "The invite action could not be completed. Refresh and try again.";
  if (code === "member-action") return "The staff update could not be completed. Refresh and try again.";
  if (code === "seat-limit") return "This plan has reached its Admin or Staff login limit. Disable an account, revoke an invite, or ask Aero to increase the limit.";
  if (code === "workspace-action") return "The workspace action could not be completed. Refresh and try again.";
  return "The workspace action could not be completed. Refresh and try again.";
}

export default async function WorkspacesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; invite?: string; email?: string; token?: string }>;
}) {
  const supabase = await createClient();
  const [{ data: claimsData, error: userError }, params, workspaces, selectedWorkspaceId, accessToken] = await Promise.all([
    getVerifiedClaims(),
    searchParams,
    getAvailableWorkspaces(),
    getSelectedWorkspaceId(),
    getRequestAccessToken(),
  ]);

  if (userError && !isMissingSessionError(userError)) {
    console.error("Workspace selector session lookup failed", {
      name: userError.name,
      status: userError.status,
      message: userError.message,
    });
    throw new Error("Unable to verify the current session.");
  }

  const userId = claimsData?.claims.sub;
  if (!userId || !accessToken) redirect("/login");

  const activeWorkspaceId = selectedWorkspaceId ?? workspaces.find((workspace) => workspace.is_last_workspace)?.organization_id ?? workspaces[0]?.organization_id ?? null;
  const activeWorkspace = workspaces.find((workspace) => workspace.organization_id === activeWorkspaceId) ?? null;
  const canManage = activeWorkspace?.role === "admin";
  const workspaceAdministration = canManage && activeWorkspaceId
    ? await getCachedWorkspaceAdministration(activeWorkspaceId, accessToken)
    : { members: [], invites: [], seatUsage: null };

  const { data: isSuperAdmin, error: superAdminError } = await supabase.rpc("is_aero_super_admin");

  if (superAdminError) {
    console.error("Aero Super Admin access check failed", {
      userId,
      code: superAdminError.code,
      message: superAdminError.message,
    });
  }

  const memberRows = workspaceAdministration.members as WorkspaceMemberRow[];
  const inviteRows = workspaceAdministration.invites as WorkspaceInviteRow[];
  const seatUsageRow = workspaceAdministration.seatUsage as WorkspaceSeatUsageRow | null;
  const inviteUrl = params.invite ? `${getAppUrl()}/workspaces?token=${encodeURIComponent(params.invite)}` : null;
  const workspaceSelectorUrl = `${getAppUrl()}/workspaces`;
  const safeErrorMessage = workspaceErrorMessage(params.error);

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-[calc(1.25rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))] text-black sm:px-6 sm:py-12">
      <div className="mx-auto grid max-w-3xl gap-6">
        {safeErrorMessage ? <div role="alert" aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700">{safeErrorMessage}</div> : null}
        {inviteUrl ? (
          <FluidEntrySurface className="rounded-2xl border border-lime/50 bg-lime/20" contentClassName="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-black">Invite created{params.email ? ` for ${params.email}` : ""}</div>
              <div className="mt-1 break-all text-xs font-bold text-zinc-600">{inviteUrl}</div>
            </div>
            <CopyInviteLinkButton url={inviteUrl} />
          </FluidEntrySurface>
        ) : null}

        <section className="grid gap-3">
          <div className="flex items-center justify-between gap-3 px-1">
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-zinc-400">Your workspaces</h2>
            <div className="flex items-center gap-2">
              <Link
                href="/aero-admin"
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-black px-3 text-xs font-black text-lime transition hover:bg-zinc-800"
                title={isSuperAdmin ? "Open Aero Admin" : "Open Aero Admin password login"}
              >
                <ShieldCheck className="size-4" />Aero Admin
              </Link>
              <AddWorkspaceShortcutButton url={workspaceSelectorUrl} />
              <Badge variant="outline" className="bg-white font-black text-zinc-600">{workspaces.length}</Badge>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
              {workspaces.length === 0 ? (
                <Empty className="col-span-full border border-dashed border-zinc-300 bg-white">
                  <EmptyHeader>
                    <EmptyTitle>No active workspace yet</EmptyTitle>
                    <EmptyDescription>Create one or paste an invite code.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : null}
              {workspaces.map((workspace) => (
                <Card key={workspace.organization_id} className="group relative rounded-3xl border-zinc-200 bg-white py-0 transition hover:border-zinc-300 hover:shadow-md">
                <form action={switchWorkspaceAction} className="absolute inset-0 z-0">
                  <input type="hidden" name="organizationId" value={workspace.organization_id} />
                  <button type="submit" className="size-full cursor-pointer rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2" aria-label={`Switch to ${workspace.organization_name}`} />
                </form>
                <CardContent className="pointer-events-none relative z-10 grid gap-3 p-4 sm:p-5">
                  <div className="flex min-h-16 items-center justify-between gap-4 text-left">
                    <span className="flex min-w-0 items-center">
                      <span className="min-w-0">
                        <span className="block truncate text-lg font-black tracking-[-0.04em]">{workspace.organization_name}</span>
                        <span className="mt-1 block text-xs font-bold capitalize text-zinc-500">{workspace.role} · ID {workspace.organization_id.split("-").at(-1)}</span>
                      </span>
                    </span>
                    <span className="shrink-0 pt-1 text-zinc-400">
                      {workspace.organization_id === activeWorkspaceId ? <Badge className="bg-lime text-[11px] font-black text-black hover:bg-lime">Current</Badge> : <ArrowRight className="size-5 transition group-hover:translate-x-0.5" />}
                    </span>
                  </div>
                {workspace.role === "admin" ? (
                  <div className="pointer-events-auto relative z-20 flex flex-wrap gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <button type="button" className="inline-flex h-9 w-fit items-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3 text-xs font-black text-zinc-600 transition hover:border-black hover:bg-white hover:text-black">
                          <Pencil className="size-3.5" />
                          Edit name
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] rounded-2xl p-4">
                        <PopoverHeader>
                          <PopoverTitle className="text-base font-black tracking-[-0.04em]">Edit workspace</PopoverTitle>
                          <PopoverDescription className="text-xs font-semibold">Update the name shown in Aero.</PopoverDescription>
                        </PopoverHeader>
                        <form action={updateWorkspaceIdentityAction} className="mt-4 grid gap-3">
                          <input type="hidden" name="organizationId" value={workspace.organization_id} />
                          <input type="hidden" name="returnTo" value="/workspaces" />
                          <Input name="name" required defaultValue={workspace.organization_name} className={inputClassName} placeholder="Workspace name" />
                          <WorkspaceActionButton confirm="Click Confirm to update this workspace." className="h-11 rounded-xl bg-lime text-sm font-black text-black hover:bg-lime">Save</WorkspaceActionButton>
                        </form>
                      </PopoverContent>
                    </Popover>
                    <form action={deleteWorkspaceAction}>
                      <input type="hidden" name="organizationId" value={workspace.organization_id} />
                      <WorkspaceActionButton confirm={`Click Confirm to delete ${workspace.organization_name}. This removes it from workspace selection.`} variant="destructive" className="h-9 rounded-xl px-3 text-xs font-black">
                        <Trash2 className="size-3.5" />
                        Delete
                      </WorkspaceActionButton>
                    </form>
                  </div>
                ) : null}
                </CardContent>
                </Card>
              ))}
            </div>
        </section>

        <section className="grid gap-3">
          <div className="px-1">
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-zinc-400">Need access?</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Collapsible defaultOpen={workspaces.length === 0} className="group rounded-3xl border-2 border-dotted border-zinc-300 bg-white shadow-sm">
              <CollapsibleTrigger className="flex min-h-20 w-full items-center justify-between gap-4 p-4 text-left">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-lime text-black"><Plus className="size-5" /></span>
                  <span>
                    <span className="block text-base font-black tracking-[-0.04em]">I&apos;m an admin</span>
                    <span className="mt-1 block text-xs font-semibold text-zinc-500">Create a workspace for your store.</span>
                  </span>
                </span>
                <ChevronDown className="size-5 shrink-0 text-zinc-400 transition group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="px-4 pb-4">
              <form action={createWorkspaceAction} className="grid gap-2">
                <Input name="name" required className={inputClassName} placeholder="Store name" />
                <NativeSelect name="defaultCountry" className={inputClassName} defaultValue="MY">
                  <NativeSelectOption value="MY">Malaysia</NativeSelectOption>
                  <NativeSelectOption value="TH">Thailand</NativeSelectOption>
                </NativeSelect>
                <WorkspaceActionButton confirm="Click Confirm to create this workspace." className="h-11 rounded-xl bg-lime text-sm font-black text-black hover:bg-lime">Create</WorkspaceActionButton>
              </form>
              </CollapsibleContent>
            </Collapsible>

            <Collapsible defaultOpen={Boolean(params.token)} className="group rounded-3xl border-2 border-dotted border-zinc-300 bg-white shadow-sm">
              <CollapsibleTrigger className="flex min-h-20 w-full items-center justify-between gap-4 p-4 text-left">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-black text-lime"><UserPlus className="size-5" /></span>
                  <span>
                    <span className="block text-base font-black tracking-[-0.04em]">I&apos;m a staff</span>
                    <span className="mt-1 block text-xs font-semibold text-zinc-500">Paste the invite code from your admin.</span>
                  </span>
                </span>
                <ChevronDown className="size-5 shrink-0 text-zinc-400 transition group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="px-4 pb-4">
              <form action={acceptWorkspaceInviteAction} className="grid gap-2">
                <Input name="token" required className={inputClassName} defaultValue={params.token ?? ""} placeholder="Invite code" />
                <WorkspaceActionButton confirm="Click Confirm to accept this invite." className="h-11 rounded-xl bg-black text-sm font-black text-white hover:bg-black">Accept</WorkspaceActionButton>
              </form>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </section>

        {canManage ? (
          <Collapsible className="group rounded-3xl border border-zinc-200 bg-white shadow-sm">
            <CollapsibleTrigger className="flex min-h-20 w-full cursor-pointer items-center justify-between gap-3 p-4 text-left">
              <div>
                <h2 className="text-lg font-black tracking-[-0.04em]">Workspace settings</h2>
                <p className="mt-0.5 text-xs font-semibold text-zinc-500">Members and invites for {activeWorkspace?.organization_name}</p>
              </div>
              <ChevronDown className="size-5 shrink-0 text-zinc-400 transition group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
            <div className="border-t border-border p-4 sm:p-5">
            {seatUsageRow ? (
              <div className="mb-5 grid gap-3 sm:grid-cols-2">
                {([
                  {
                    label: "Admin logins",
                    used: seatUsageRow.active_admin_count + seatUsageRow.invited_admin_count + seatUsageRow.reserved_admin_count,
                    active: seatUsageRow.active_admin_count,
                    reserved: seatUsageRow.invited_admin_count + seatUsageRow.reserved_admin_count,
                    limit: seatUsageRow.admin_limit,
                  },
                  {
                    label: "Staff logins",
                    used: seatUsageRow.active_staff_count + seatUsageRow.invited_staff_count + seatUsageRow.reserved_staff_count,
                    active: seatUsageRow.active_staff_count,
                    reserved: seatUsageRow.invited_staff_count + seatUsageRow.reserved_staff_count,
                    limit: seatUsageRow.staff_limit,
                  },
                ] as const).map((seat) => (
                  <div key={seat.label} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-black">{seat.label}</span>
                      <Badge variant="outline" className="bg-white font-black">{seat.used} / {seat.limit}</Badge>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-zinc-500">{seat.active} active · {seat.reserved} invited/reserved</p>
                  </div>
                ))}
                <p className="text-xs font-semibold text-zinc-500 sm:col-span-2">Viewer accounts are read-only and do not use Admin or Staff login seats. Active viewers: {seatUsageRow.active_viewer_count}.</p>
              </div>
            ) : null}
            <form action={inviteWorkspaceMemberAction} className="grid gap-2 sm:grid-cols-[1fr_130px_auto]">
              <Input name="email" type="email" required className={inputClassName} placeholder="member@email.com" />
              <NativeSelect name="role" className={inputClassName} defaultValue="staff">
                <NativeSelectOption value="staff">Staff</NativeSelectOption>
                <NativeSelectOption value="admin">Admin</NativeSelectOption>
                <NativeSelectOption value="viewer">Viewer</NativeSelectOption>
              </NativeSelect>
              <WorkspaceActionButton confirm="Click Confirm to create this invite." className="h-11 rounded-xl bg-lime px-5 text-sm font-black text-black hover:bg-lime">Invite</WorkspaceActionButton>
            </form>

            <div className="mt-6 grid gap-2">
              <h3 className="text-sm font-black uppercase tracking-[0.14em] text-zinc-400">Members</h3>
              {memberRows.map((member) => (
                <div key={member.user_id} className="grid gap-3 rounded-2xl border border-border bg-zinc-50 p-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="truncate text-base font-black tracking-[-0.04em]">{member.full_name || member.email || member.user_id}</div>
                    <div className="mt-1 text-xs font-bold text-zinc-500">{member.status} · joined {new Date(member.created_at).toLocaleDateString()}</div>
                  </div>
                  <form action={updateWorkspaceMemberRoleAction} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <input type="hidden" name="userId" value={member.user_id} />
                    <NativeSelect name="role" defaultValue={member.role} size="sm" className="h-10 rounded-xl bg-white text-xs font-black">
                      <NativeSelectOption value="staff">Staff</NativeSelectOption>
                      <NativeSelectOption value="admin">Admin</NativeSelectOption>
                      <NativeSelectOption value="viewer">Viewer</NativeSelectOption>
                    </NativeSelect>
                    <WorkspaceActionButton confirm="Click Confirm to update this member role." className="h-10 rounded-xl px-3 text-xs font-black">Role</WorkspaceActionButton>
                  </form>
                  <form action={updateWorkspaceMemberStatusAction} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                    <input type="hidden" name="userId" value={member.user_id} />
                    <input type="hidden" name="status" value={member.status === "active" ? "disabled" : "active"} />
                    <WorkspaceActionButton confirm="Click Confirm to update this member status." className="h-10 rounded-xl px-3 text-xs font-black" variant={member.status === "active" ? "outline" : "default"}>
                      {member.status === "active" ? "Disable" : "Enable"}
                    </WorkspaceActionButton>
                  </form>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-2">
              <h3 className="text-sm font-black uppercase tracking-[0.14em] text-zinc-400">Invites</h3>
              {inviteRows.length === 0 ? <div className="rounded-2xl bg-zinc-50 p-4 text-sm font-bold text-zinc-500">No invites yet.</div> : null}
              {inviteRows.map((invite) => {
                const isOpen = !invite.revoked_at && !invite.accepted_at && invite.use_count < invite.max_uses && new Date(invite.expires_at) > new Date();
                const rowInviteUrl = invite.invite_token ? `${getAppUrl()}/workspaces?token=${encodeURIComponent(invite.invite_token)}` : null;

                return (
                  <div key={invite.id} className="grid gap-3 rounded-2xl border border-border bg-zinc-50 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="truncate text-base font-black tracking-[-0.04em]">{invite.email ?? "Open invite"}</div>
                      <div className="mt-1 text-xs font-bold text-zinc-500">{invite.role} · {isOpen ? "open" : "closed"} · expires {new Date(invite.expires_at).toLocaleDateString()}</div>
                    </div>
                    {isOpen ? (
                      <div className="flex flex-wrap gap-2">
                        {rowInviteUrl ? <CopyInviteLinkButton url={rowInviteUrl} className="h-10 px-3 text-xs" /> : <span className="inline-flex h-10 items-center rounded-xl bg-zinc-100 px-3 text-xs font-black text-zinc-500">Token unavailable</span>}
                        <form action={revokeWorkspaceInviteAction}>
                          <input type="hidden" name="inviteId" value={invite.id} />
                          <WorkspaceActionButton confirm="Click Confirm to revoke this invite." className="h-10 rounded-xl px-3 text-xs font-black">Revoke</WorkspaceActionButton>
                        </form>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            </div>
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </div>
    </main>
  );
}
