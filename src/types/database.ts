export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type StockAdjustmentReason =
  | "Returned"
  | "New Products"
  | "Stock Adjustment"
  | "Transfer"
  | "Others"
  | "Excel Import"
  | "Warehouse Transfer";

export type PartnerShareStatus = "draft" | "confirmed" | "sent" | "completed";

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          icon: string;
          slug: string | null;
          default_country: string;
          created_by: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      organization_members: {
        Row: {
          organization_id: string;
          user_id: string;
          role: "admin" | "staff";
          status: "active" | "invited" | "disabled";
          invited_by: string | null;
          accepted_at: string | null;
          disabled_at: string | null;
          last_accessed_at: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      user_workspace_preferences: {
        Row: {
          user_id: string;
          last_organization_id: string | null;
          updated_at: string;
        };
      };
      organization_invites: {
        Row: {
          id: string;
          organization_id: string;
          email: string | null;
          role: "admin" | "staff";
          token_hash: string;
          invite_token: string | null;
          max_uses: number;
          use_count: number;
          expires_at: string;
          revoked_at: string | null;
          created_by: string | null;
          accepted_by: string | null;
          accepted_at: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      locations: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          is_default: boolean;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      sku_variation_groups: {
        Row: {
          id: string;
          organization_id: string;
          product_name: string;
          variation_name: string;
          add_variation_images: boolean;
          created_at: string;
          updated_at: string;
        };
      };
      stock_movements: {
        Row: {
          id: string;
          organization_id: string;
          sku_id: string;
          location_id: string;
          actor_user_id: string;
          movement_type: "add" | "deduct" | "adjustment";
          quantity_delta: number;
          quantity_before: number;
          quantity_after: number;
          reason: StockAdjustmentReason;
          note: string | null;
          created_at: string;
        };
      };
      audit_events: {
        Row: {
          id: string;
          organization_id: string;
          actor_user_id: string | null;
          actor_role: string | null;
          event_type: string;
          entity_type: string;
          entity_id: string | null;
          entity_label: string | null;
          action: string;
          before_data: Json | null;
          after_data: Json | null;
          metadata: Json | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
      };
      restock_requests: {
        Row: {
          id: string;
          organization_id: string;
          sku_id: string;
          location_id: string;
          requested_by: string;
          status: "open" | "acknowledged" | "ordered" | "resolved" | "cancelled";
          requested_qty: number | null;
          current_qty_snapshot: number;
          low_stock_qty_snapshot: number;
          note: string | null;
          created_at: string;
          acknowledged_at: string | null;
          ordered_at: string | null;
          resolved_at: string | null;
        };
      };
      restock_request_events: {
        Row: {
          id: string;
          organization_id: string;
          restock_request_id: string;
          actor_user_id: string;
          from_status: "open" | "acknowledged" | "ordered" | "resolved" | "cancelled" | null;
          to_status: "open" | "acknowledged" | "ordered" | "resolved" | "cancelled" | null;
          comment: string | null;
          created_at: string;
        };
      };
      product_categories: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      partners: {
        Row: PartnerRow;
      };
      partner_share_sheets: {
        Row: {
          id: string;
          organization_id: string;
          partner_id: string;
          location_id: string;
          source_shop_name: string;
          share_date: string;
          status: PartnerShareStatus;
          created_by: string | null;
          updated_by: string | null;
          confirmed_by: string | null;
          sent_by: string | null;
          completed_by: string | null;
          stock_deducted_by: string | null;
          confirmed_at: string | null;
          sent_at: string | null;
          completed_at: string | null;
          stock_deducted_at: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      partner_share_items: {
        Row: PartnerShareItemRow;
      };
    };
    Functions: {
      claim_bootstrap_admin: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      get_my_membership: {
        Args: Record<PropertyKey, never>;
        Returns: {
          organization_id: string;
          organization_name: string;
          organization_icon: string;
          role: string;
          user_email: string;
          full_name: string;
        }[];
      };
      get_my_workspaces: {
        Args: Record<PropertyKey, never>;
        Returns: WorkspaceMembership[];
      };
      set_last_workspace: {
        Args: { p_organization_id: string };
        Returns: string;
      };
      create_workspace: {
        Args: { p_name: string; p_icon?: string; p_default_country?: "MY" | "TH" };
        Returns: string;
      };
      admin_invite_workspace_member: {
        Args: { p_organization_id: string; p_email: string; p_role?: "admin" | "staff"; p_expires_in_days?: number };
        Returns: WorkspaceInviteTokenRow[];
      };
      accept_workspace_invite: {
        Args: { p_token: string };
        Returns: string;
      };
      admin_list_workspace_members: {
        Args: { p_organization_id: string };
        Returns: WorkspaceMemberRow[];
      };
      admin_list_workspace_invites: {
        Args: { p_organization_id: string };
        Returns: WorkspaceInviteRow[];
      };
      admin_update_workspace_member_role: {
        Args: { p_organization_id: string; p_user_id: string; p_role: "admin" | "staff" };
        Returns: string;
      };
      admin_set_workspace_member_status: {
        Args: { p_organization_id: string; p_user_id: string; p_status: "active" | "invited" | "disabled" };
        Returns: string;
      };
      admin_revoke_workspace_invite: {
        Args: { p_invite_id: string };
        Returns: string;
      };
      get_staff_inventory_overview: {
        Args: { p_organization_id: string };
        Returns: StaffInventoryRow[];
      };
      get_admin_inventory_overview: {
        Args: { p_organization_id: string };
        Returns: AdminInventoryRow[];
      };
      adjust_stock: {
        Args: { p_sku_id: string; p_location_id: string; p_delta: number; p_note?: string | null; p_reason?: StockAdjustmentReason };
        Returns: { sku_id: string; location_id: string; quantity: number; movement_id: string }[];
      };
      create_restock_request: {
        Args: { p_sku_id: string; p_location_id: string; p_requested_qty?: number | null; p_note?: string | null };
        Returns: string;
      };
      update_restock_request_status: {
        Args: { p_request_id: string; p_status: "open" | "acknowledged" | "ordered" | "resolved" | "cancelled"; p_comment?: string | null };
        Returns: string;
      };
      get_admin_restock_requests: {
        Args: { p_organization_id: string };
        Returns: RestockRequestRow[];
      };
      get_admin_sku_manager_rows: {
        Args: { p_organization_id: string };
        Returns: AdminSkuManagerRow[];
      };
      admin_create_sku: {
        Args: Record<string, unknown>;
        Returns: string;
      };
      admin_create_sku_variation_group: {
        Args: Record<string, unknown>;
        Returns: string;
      };
      admin_update_sku: {
        Args: Record<string, unknown>;
        Returns: string;
      };
      admin_archive_sku: {
        Args: { p_sku_id: string };
        Returns: string;
      };
      admin_update_sku_photo: {
        Args: { p_sku_id: string; p_photo_path: string | null };
        Returns: string;
      };
      admin_upsert_product_category: {
        Args: { p_organization_id: string; p_name: string };
        Returns: string;
      };
      admin_update_product_category: {
        Args: { p_category_id: string; p_name: string };
        Returns: string;
      };
      get_partner_share_page_data: {
        Args: { p_organization_id: string };
        Returns: Json;
      };
      get_partner_share_sheet_detail: {
        Args: { p_sheet_id: string };
        Returns: Json;
      };
      admin_create_partner: {
        Args: { p_organization_id: string; p_name: string; p_contact_name?: string | null; p_phone_raw?: string | null; p_whatsapp_number?: string | null; p_notes?: string | null };
        Returns: string;
      };
      admin_update_partner: {
        Args: { p_partner_id: string; p_name: string; p_contact_name?: string | null; p_phone_raw?: string | null; p_whatsapp_number?: string | null; p_notes?: string | null };
        Returns: string;
      };
      admin_archive_partner: {
        Args: { p_partner_id: string };
        Returns: string;
      };
      admin_create_partner_share_sheet: {
        Args: { p_partner_id: string; p_location_id: string; p_share_date?: string | null };
        Returns: string;
      };
      admin_add_partner_share_item: {
        Args: { p_sheet_id: string; p_sku_id: string; p_share_qty: number; p_remark?: string | null };
        Returns: string;
      };
      admin_update_partner_share_item: {
        Args: { p_item_id: string; p_share_qty: number; p_remark?: string | null };
        Returns: string;
      };
      admin_remove_partner_share_item: {
        Args: { p_item_id: string };
        Returns: string;
      };
      admin_update_partner_share_status: {
        Args: { p_sheet_id: string; p_status: PartnerShareStatus };
        Returns: string;
      };
      admin_deduct_partner_share_stock: {
        Args: { p_sheet_id: string };
        Returns: string;
      };
      admin_record_partner_share_output: {
        Args: { p_sheet_id: string; p_output_type: "whatsapp_copy" | "excel_export" };
        Returns: string;
      };
    };
    Enums: {
      member_role: "admin" | "staff";
      member_status: "active" | "invited" | "disabled";
      movement_type: "add" | "deduct" | "adjustment";
      plan_name: "basic" | "custom";
    };
  };
};

export type StaffInventoryRow = {
  sku_id: string;
  location_id: string;
  product_name: string;
  variant: string | null;
  sku_code: string;
  photo_path: string | null;
  photo_url?: string | null;
  price: number;
  quantity: number;
  low_stock_qty: number;
  max_stock_qty: number;
  location_name: string;
  is_low_stock: boolean;
  is_out_of_stock: boolean;
  category_name: string | null;
};

export type AdminInventoryRow = StaffInventoryRow & {
  supplier_name: string | null;
  contact_name: string | null;
  phone_raw: string | null;
  whatsapp_number: string | null;
};

export type Membership = {
  organization_id: string;
  organization_name: string;
  organization_icon: string;
  organization_slug: string | null;
  role: "admin" | "staff";
  user_email: string;
  full_name: string | null;
  workspaces: WorkspaceMembership[];
};

export type WorkspaceMembership = {
  organization_id: string;
  organization_name: string;
  organization_icon: string;
  organization_slug: string | null;
  role: "admin" | "staff";
  status: "active" | "invited" | "disabled";
  user_email: string | null;
  full_name: string | null;
  last_accessed_at: string | null;
  is_last_workspace: boolean;
  created_at: string;
};

export type WorkspaceMemberRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: "admin" | "staff";
  status: "active" | "invited" | "disabled";
  invited_by: string | null;
  accepted_at: string | null;
  disabled_at: string | null;
  last_accessed_at: string | null;
  created_at: string;
};

export type WorkspaceInviteRow = {
  id: string;
  email: string | null;
  role: "admin" | "staff";
  invite_token: string | null;
  expires_at: string;
  revoked_at: string | null;
  accepted_at: string | null;
  use_count: number;
  max_uses: number;
  created_at: string;
};

export type WorkspaceInviteTokenRow = {
  invite_id: string;
  token: string;
  email: string;
  role: "admin" | "staff";
  expires_at: string;
};

export type RestockStatus = "open" | "acknowledged" | "ordered" | "resolved" | "cancelled";

export type RestockRequestRow = {
  id: string;
  sku_id: string;
  location_id: string;
  status: RestockStatus;
  requested_qty: number | null;
  current_qty_snapshot: number;
  low_stock_qty_snapshot: number;
  note: string | null;
  created_at: string;
  product_name: string;
  sku_code: string;
  requested_by_name: string | null;
  requested_by_email: string | null;
};

export type AdminSkuManagerRow = {
  sku_id: string;
  location_id: string;
  product_name: string;
  variant: string | null;
  sku_code: string;
  photo_path: string | null;
  photo_url?: string | null;
  price: number;
  variation_group_id: string | null;
  variation_name: string | null;
  add_variation_images: boolean | null;
  quantity: number;
  low_stock_qty: number;
  max_stock_qty: number;
  supplier_name: string | null;
  contact_name: string | null;
  country: string | null;
  phone_raw: string | null;
  whatsapp_number: string | null;
  category_name: string | null;
};

export type ProductCategoryRow = {
  id: string;
  name: string;
};

export type PartnerRow = {
  id: string;
  name: string;
  contact_name: string | null;
  phone_raw: string | null;
  whatsapp_number: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PartnerShareSheetSummary = {
  id: string;
  partner_id: string;
  partner_name: string;
  location_id: string;
  location_name: string;
  source_shop_name: string;
  share_date: string;
  status: PartnerShareStatus;
  item_count: number;
  total_share_qty: number;
  prepared_by_name: string | null;
  approved_by_name: string | null;
  sent_by_name: string | null;
  completed_by_name: string | null;
  stock_deducted_by_name: string | null;
  confirmed_at: string | null;
  sent_at: string | null;
  completed_at: string | null;
  stock_deducted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PartnerShareItemRow = {
  id: string;
  sheet_id: string;
  sku_id: string;
  location_id: string;
  product_name: string;
  variant: string | null;
  sku_code: string;
  current_stock_snapshot: number;
  photo_path: string | null;
  photo_url?: string | null;
  supplier_name: string | null;
  category_name: string | null;
  share_qty: number;
  remark: string | null;
  created_at: string;
  updated_at: string;
};

export type PartnerShareSheetDetail = {
  sheet: PartnerShareSheetSummary & { organization_id: string };
  items: PartnerShareItemRow[];
};

export type PartnerSharePageData = {
  partners: PartnerRow[];
  categories: ProductCategoryRow[];
  sheets: PartnerShareSheetSummary[];
};
