export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type StockAdjustmentReason =
  | "Returned"
  | "New Products"
  | "Stock Adjustment"
  | "Transfer"
  | "Others"
  | "Excel Import"
  | "Warehouse Transfer";

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          icon: string;
          default_country: string;
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
          created_at: string;
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
  role: "admin" | "staff";
  user_email: string;
  full_name: string | null;
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
};
