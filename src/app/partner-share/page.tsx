import { redirect } from "next/navigation";

import { LazyPartnerShareManager } from "@/components/lazy-page-components";
import { getRequestAccessToken, requireMembership } from "@/lib/auth";
import {
  getCachedAdminInventory,
  getCachedPartnerSharePageData,
  getCachedPartnerShareSheetDetail,
  getCachedRestockRequests,
  getCachedStaffInventory,
} from "@/lib/cached-data";
import { withSignedSkuPhotoUrls } from "@/lib/sku-photos";

export default async function PartnerSharePage() {
  const membership = await requireMembership();
  const accessToken = await getRequestAccessToken();
  if (!accessToken) redirect("/login");

  const [pageData, inventoryRows, restockRequests] = await Promise.all([
    getCachedPartnerSharePageData(membership.organization_id, accessToken),
    membership.role === "admin"
      ? getCachedAdminInventory(membership.organization_id, accessToken)
      : getCachedStaffInventory(membership.organization_id, accessToken),
    membership.role === "admin"
      ? getCachedRestockRequests(membership.organization_id, accessToken)
      : Promise.resolve([]),
  ]);

  const details = await Promise.all(
    pageData.sheets.map((sheet) => getCachedPartnerShareSheetDetail(membership.organization_id, sheet.id, accessToken)),
  );
  const detailsWithPhotos = await Promise.all(
    details.map(async (detail) => ({ ...detail, items: await withSignedSkuPhotoUrls(detail.items) })),
  );
  const inventory = await withSignedSkuPhotoUrls(inventoryRows);

  return (
    <LazyPartnerShareManager
      membership={membership}
      pageData={pageData}
      details={detailsWithPhotos}
      inventoryRows={inventory}
      restockCount={restockRequests.length}
    />
  );
}
