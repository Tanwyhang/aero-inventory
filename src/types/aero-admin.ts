export type AeroCustomerStatus = "active" | "suspended" | "archived";

export type AeroSuperAdminCustomer = {
  organizationId: string;
  name: string;
  icon: string | null;
  slug: string | null;
  status: AeroCustomerStatus;
  plan: string;
  adminLimit: number;
  staffLimit: number;
  skuLimit: number;
  warehouseLimit: number;
  activeAdminCount: number;
  invitedAdminCount: number;
  reservedAdminCount: number;
  activeStaffCount: number;
  invitedStaffCount: number;
  reservedStaffCount: number;
  activeViewerCount: number;
  memberCount: number;
  skuCount: number;
  warehouseCount: number;
  primaryAdminEmail: string | null;
  primaryAdminName: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  archivedAt: string | null;
};
