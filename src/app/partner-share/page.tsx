import { PartnerShareManager } from "@/components/partner-share-manager";
import { requireMembership } from "@/lib/auth";
import { withSignedSkuPhotoUrls } from "@/lib/sku-photos";
import { createClient } from "@/lib/supabase/server";
import type { AdminInventoryRow, PartnerSharePageData, PartnerShareSheetDetail, StaffInventoryRow } from "@/types/database";

export default async function PartnerSharePage() {
  const membership = await requireMembership();
  const supabase = await createClient();
  const [{ data: pageData, error: pageError }, { data: inventoryRows, error: inventoryError }, { data: restockRequests, error: restockError }] = await Promise.all([
    supabase.rpc("get_partner_share_page_data", { p_organization_id: membership.organization_id }),
    membership.role === "admin"
      ? supabase.rpc("get_admin_inventory_overview", { p_organization_id: membership.organization_id })
      : supabase.rpc("get_staff_inventory_overview", { p_organization_id: membership.organization_id }),
    membership.role === "admin" ? supabase.rpc("get_admin_restock_requests", { p_organization_id: membership.organization_id }) : Promise.resolve({ data: [], error: null }),
  ]);

  if (pageError || inventoryError || restockError) {
    console.error("Partner Share data failed to load", {
      workspaceId: membership.organization_id,
      pageCode: pageError?.code ?? null,
      inventoryCode: inventoryError?.code ?? null,
      restockCode: restockError?.code ?? null,
      pageMessage: pageError?.message ?? null,
      inventoryMessage: inventoryError?.message ?? null,
      restockMessage: restockError?.message ?? null,
    });
    throw new Error("Unable to load Partner Share Qty.");
  }

  const parsedPageData = (pageData ?? { partners: [], categories: [], sheets: [] }) as PartnerSharePageData;
  const detailResults = await Promise.all(
    parsedPageData.sheets.map((sheet) => supabase.rpc("get_partner_share_sheet_detail", { p_sheet_id: sheet.id })),
  );
  const detailErrors = detailResults.map((result) => result.error).filter(Boolean);

  if (detailErrors[0]) {
    console.error("Partner Share sheet details failed to load", {
      workspaceId: membership.organization_id,
      code: detailErrors[0].code,
      message: detailErrors[0].message,
    });
    throw new Error("Unable to load Partner Share sheet details.");
  }

  const details = await Promise.all(
    detailResults.map(async (result) => {
      const detail = result.data as PartnerShareSheetDetail;
      return { ...detail, items: await withSignedSkuPhotoUrls(detail.items) };
    }),
  );
  const inventory = await withSignedSkuPhotoUrls((inventoryRows ?? []) as Array<AdminInventoryRow | StaffInventoryRow>);

  return (
    <PartnerShareManager
      membership={membership}
      pageData={parsedPageData}
      details={details}
      inventoryRows={inventory}
      restockCount={(restockRequests ?? []).length}
    />
  );
}
