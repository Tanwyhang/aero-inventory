import { redirect } from "next/navigation";
import { ArrowRight, ChevronDown, Pencil, Plus, UserPlus } from "lucide-react";

import {
  acceptWorkspaceInviteAction,
  createWorkspaceAction,
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
import { getAvailableWorkspaces, getSelectedWorkspaceId } from "@/lib/auth";
import { getAppUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { WorkspaceInviteRow, WorkspaceMemberRow } from "@/types/database";

const inputClassName = "h-11 rounded-xl bg-white text-sm font-semibold";

export default async function WorkspacesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; invite?: string; email?: string; token?: string }>;
}) {
  const supabase = await createClient();
  const [{ data: userData }, params, workspaces, selectedWorkspaceId] = await Promise.all([
    supabase.auth.getUser(),
    searchParams,
    getAvailableWorkspaces(),
    getSelectedWorkspaceId(),
  ]);

  if (!userData.user) redirect("/login");

  const activeWorkspaceId = selectedWorkspaceId ?? workspaces.find((workspace) => workspace.is_last_workspace)?.organization_id ?? workspaces[0]?.organization_id ?? null;
  const activeWorkspace = workspaces.find((workspace) => workspace.organization_id === activeWorkspaceId) ?? null;
  const canManage = activeWorkspace?.role === "admin";
  const [{ data: members, error: membersError }, { data: invites, error: invitesError }] = canManage && activeWorkspaceId
    ? await Promise.all([
      supabase.rpc("admin_list_workspace_members", { p_organization_id: activeWorkspaceId }),
      supabase.rpc("admin_list_workspace_invites", { p_organization_id: activeWorkspaceId }),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];

  if (membersError || invitesError) throw new Error(membersError?.message ?? invitesError?.message ?? "Failed to load workspace admin data");

  const memberRows = (members ?? []) as WorkspaceMemberRow[];
  const inviteRows = (invites ?? []) as WorkspaceInviteRow[];
  const inviteUrl = params.invite ? `${getAppUrl()}/workspaces?token=${encodeURIComponent(params.invite)}` : null;
  const workspaceSelectorUrl = `${getAppUrl()}/workspaces`;

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-[calc(1.25rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))] text-black sm:px-6 sm:py-12">
      <div className="mx-auto grid max-w-3xl gap-6">
        {params.error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700">{params.error}</div> : null}
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
                  <div className="pointer-events-auto relative z-20 w-fit">
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
            <form action={inviteWorkspaceMemberAction} className="grid gap-2 sm:grid-cols-[1fr_130px_auto]">
              <Input name="email" type="email" required className={inputClassName} placeholder="member@email.com" />
              <NativeSelect name="role" className={inputClassName} defaultValue="staff">
                <NativeSelectOption value="staff">Staff</NativeSelectOption>
                <NativeSelectOption value="admin">Admin</NativeSelectOption>
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
