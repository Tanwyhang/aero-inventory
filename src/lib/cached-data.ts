import "server-only";

import { createHash } from "node:crypto";
import { unstable_cache, revalidateTag } from "next/cache";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseEnv } from "@/lib/env";
import type {
  AdminInventoryRow,
  AdminSkuManagerRow,
  Database,
  PartnerSharePageData,
  PartnerShareSheetDetail,
  RestockRequestRow,
  StaffInventoryRow,
  WorkspaceInviteRow,
  WorkspaceMemberRow,
  WorkspaceSeatUsageRow,
} from "@/types/database";

const WORKSPACE_DATA_CACHE_SECONDS = 60;
const PHOTO_URL_CACHE_SECONDS = 10 * 60;
const CACHE_VERSION = "v1";

// This cache wrapper deliberately accepts the generic Supabase client shape.
// The app's hand-maintained Database type models read rows and RPCs but not the
// full generated Insert/Update/Relationships metadata required by supabase-js.
type AuthorizedClient = SupabaseClient;

export type ReportMovementRow = {
  id: string;
  sku_id: string;
  location_id: string;
  actor_user_id: string;
  movement_type: string;
  quantity_delta: number;
  quantity_before: number;
  quantity_after: number;
  reason: Database["public"]["Tables"]["stock_movements"]["Row"]["reason"] | null;
  note: string | null;
  created_at: string;
};

export type ReportAuditEventRow = {
  id: string;
  event_type: string;
  entity_type: string;
  action: string;
  entity_label: string | null;
  actor_user_id: string | null;
  actor_role: string | null;
  before_data: unknown;
  after_data: unknown;
  metadata: unknown;
  created_at: string;
};

function workspaceCacheTag(organizationId: string) {
  return `aero:workspace:${organizationId}`;
}

function accessTokenCacheKey(accessToken: string) {
  return createHash("sha256").update(accessToken).digest("hex");
}

function createAuthorizedClient(accessToken: string): AuthorizedClient {
  const { url, key } = getSupabaseEnv();

  return createSupabaseClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

async function cachedWorkspaceQuery<T>(
  scope: string,
  organizationId: string,
  accessToken: string,
  query: (supabase: AuthorizedClient) => Promise<T>,
  revalidate = WORKSPACE_DATA_CACHE_SECONDS,
): Promise<T> {
  if (!accessToken) throw new Error("An authenticated session is required to load workspace data.");

  const tokenKey = accessTokenCacheKey(accessToken);
  const load = unstable_cache(
    async () => query(createAuthorizedClient(accessToken)),
    ["aero-workspace-data", CACHE_VERSION, scope, organizationId, tokenKey],
    {
      revalidate,
      tags: [workspaceCacheTag(organizationId)],
    },
  );

  return load();
}

function throwQueryError(scope: string, organizationId: string, error: { code?: string; message?: string }) {
  console.error("Cached workspace query failed", {
    scope,
    workspaceId: organizationId,
    code: error.code ?? null,
    message: error.message ?? null,
  });
  throw new Error(`Unable to load ${scope}.`);
}

export function revalidateWorkspaceData(organizationId: string) {
  revalidateTag(workspaceCacheTag(organizationId));
}

export async function getCachedStaffInventory(organizationId: string, accessToken: string) {
  return cachedWorkspaceQuery("staff-inventory", organizationId, accessToken, async (supabase) => {
    const { data, error } = await supabase.rpc("get_staff_inventory_overview", { p_organization_id: organizationId });
    if (error) throwQueryError("staff inventory", organizationId, error);
    return (data ?? []) as StaffInventoryRow[];
  });
}

export async function getCachedAdminInventory(organizationId: string, accessToken: string) {
  return cachedWorkspaceQuery("admin-inventory", organizationId, accessToken, async (supabase) => {
    const { data, error } = await supabase.rpc("get_admin_inventory_overview", { p_organization_id: organizationId });
    if (error) throwQueryError("admin inventory", organizationId, error);
    return (data ?? []) as AdminInventoryRow[];
  });
}

export async function getCachedRestockRequests(organizationId: string, accessToken: string) {
  return cachedWorkspaceQuery("restock-requests", organizationId, accessToken, async (supabase) => {
    const { data, error } = await supabase.rpc("get_admin_restock_requests", { p_organization_id: organizationId });
    if (error) throwQueryError("restock requests", organizationId, error);
    return (data ?? []) as RestockRequestRow[];
  });
}

export async function getCachedActiveRestockCount(organizationId: string, accessToken: string) {
  return cachedWorkspaceQuery("active-restock-count", organizationId, accessToken, async (supabase) => {
    const { count, error } = await supabase
      .from("restock_requests")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("status", ["open", "acknowledged", "ordered"]);

    if (error) throwQueryError("active restock count", organizationId, error);
    return count ?? 0;
  });
}

export async function getCachedSkuManagerRows(organizationId: string, accessToken: string) {
  return cachedWorkspaceQuery("sku-manager", organizationId, accessToken, async (supabase) => {
    const { data, error } = await supabase.rpc("get_admin_sku_manager_rows", { p_organization_id: organizationId });
    if (error) throwQueryError("SKU records", organizationId, error);
    return (data ?? []) as AdminSkuManagerRow[];
  });
}

export async function getCachedProductCategories(organizationId: string, accessToken: string) {
  return cachedWorkspaceQuery("product-categories", organizationId, accessToken, async (supabase) => {
    const { data, error } = await supabase
      .from("product_categories")
      .select("id, name")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("name", { ascending: true });
    if (error) throwQueryError("product categories", organizationId, error);
    return data ?? [];
  });
}

export async function getCachedPartnerSharePageData(organizationId: string, accessToken: string) {
  return cachedWorkspaceQuery("partner-share-page", organizationId, accessToken, async (supabase) => {
    const { data, error } = await supabase.rpc("get_partner_share_page_data", { p_organization_id: organizationId });
    if (error) throwQueryError("Partner Share data", organizationId, error);
    return (data ?? { partners: [], categories: [], sheets: [] }) as PartnerSharePageData;
  });
}

export async function getCachedPartnerShareSheetDetail(
  organizationId: string,
  sheetId: string,
  accessToken: string,
) {
  return cachedWorkspaceQuery(`partner-share-sheet:${sheetId}`, organizationId, accessToken, async (supabase) => {
    const { data, error } = await supabase.rpc("get_partner_share_sheet_detail", { p_sheet_id: sheetId });
    if (error) throwQueryError("Partner Share sheet details", organizationId, error);
    return data as PartnerShareSheetDetail;
  });
}

export async function getCachedReportActivity(organizationId: string, accessToken: string) {
  return cachedWorkspaceQuery("report-activity", organizationId, accessToken, async (supabase) => {
    const [{ data: movements, error: movementsError }, { data: auditEvents, error: auditEventsError }] = await Promise.all([
      supabase
        .from("stock_movements")
        .select("id, sku_id, location_id, actor_user_id, movement_type, quantity_delta, quantity_before, quantity_after, reason, note, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("audit_events")
        .select("id, event_type, entity_type, action, entity_label, actor_user_id, actor_role, before_data, after_data, metadata, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (movementsError) throwQueryError("stock movement reports", organizationId, movementsError);
    if (auditEventsError) throwQueryError("audit reports", organizationId, auditEventsError);

    return {
      movements: (movements ?? []) as ReportMovementRow[],
      auditEvents: (auditEvents ?? []) as ReportAuditEventRow[],
    };
  });
}

export async function getCachedReportReferences(organizationId: string, accessToken: string) {
  return cachedWorkspaceQuery("report-references", organizationId, accessToken, async (supabase) => {
    const [{ data: members, error: membersError }, { data: locations, error: locationsError }] = await Promise.all([
      supabase.rpc("admin_list_workspace_members", { p_organization_id: organizationId }),
      supabase.from("locations").select("id, name").eq("organization_id", organizationId),
    ]);

    if (membersError) throwQueryError("report members", organizationId, membersError);
    if (locationsError) throwQueryError("report locations", organizationId, locationsError);

    return {
      members: (members ?? []) as WorkspaceMemberRow[],
      locations: locations ?? [],
    };
  });
}

export async function getCachedWorkspaceAdministration(organizationId: string, accessToken: string) {
  return cachedWorkspaceQuery("workspace-administration", organizationId, accessToken, async (supabase) => {
    const [{ data: members, error: membersError }, { data: invites, error: invitesError }, { data: seatUsage, error: seatUsageError }] = await Promise.all([
      supabase.rpc("admin_list_workspace_members", { p_organization_id: organizationId }),
      supabase.rpc("admin_list_workspace_invites", { p_organization_id: organizationId }),
      supabase.rpc("get_workspace_seat_usage", { p_organization_id: organizationId }),
    ]);

    if (membersError) throwQueryError("workspace members", organizationId, membersError);
    if (invitesError) throwQueryError("workspace invites", organizationId, invitesError);
    if (seatUsageError) throwQueryError("workspace seat usage", organizationId, seatUsageError);

    return {
      members: (members ?? []) as WorkspaceMemberRow[],
      invites: (invites ?? []) as WorkspaceInviteRow[],
      seatUsage: ((seatUsage ?? []) as WorkspaceSeatUsageRow[])[0] ?? null,
    };
  });
}

export async function getCachedSignedPhotoUrls(paths: string[], accessToken: string) {
  if (paths.length === 0) return new Map<string, string>();

  const normalizedPaths = Array.from(new Set(paths)).sort();
  const pathsKey = createHash("sha256").update(normalizedPaths.join("\n")).digest("hex");
  const tokenKey = accessTokenCacheKey(accessToken);
  const load = unstable_cache(
    async () => {
      const supabase = createAuthorizedClient(accessToken);
      const { data, error } = await supabase.storage.from("sku-photos").createSignedUrls(normalizedPaths, 60 * 30);
      if (error) {
        console.error("Cached SKU photo signing failed", { code: error.name, message: error.message });
        return [] as Array<[string, string]>;
      }
      return (data ?? []).flatMap((item) => item.signedUrl ? [[item.path, item.signedUrl] as [string, string]] : []);
    },
    ["aero-photo-urls", CACHE_VERSION, pathsKey, tokenKey],
    { revalidate: PHOTO_URL_CACHE_SECONDS },
  );

  return new Map(await load());
}
