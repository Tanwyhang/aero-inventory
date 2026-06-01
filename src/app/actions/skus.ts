"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireMembership } from "@/lib/auth";
import { normalizeWhatsAppNumber } from "@/lib/phone";
import { SKU_PHOTOS_BUCKET } from "@/lib/sku-photos";
import { createClient } from "@/lib/supabase/server";
import type { AdminSkuManagerRow } from "@/types/database";

const skuSchema = z.object({
  skuId: z.string().uuid().optional(),
  productName: z.string().trim().min(1).max(160),
  variant: z.string().trim().max(80).optional(),
  skuCode: z.string().trim().min(1).max(80),
  supplierName: z.string().trim().min(1).max(160),
  contactName: z.string().trim().max(120).optional(),
  country: z.enum(["MY", "TH"]),
  phoneRaw: z.string().trim().min(5).max(60),
  lowStockQty: z.coerce.number().int().min(0).max(100000),
  maxStockQty: z.coerce.number().int().min(0).max(100000),
  openingStock: z.coerce.number().int().min(0).max(100000).optional(),
});

const MAX_PHOTO_SIZE = 5 * 1024 * 1024;
const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function extensionForPhoto(file: File) {
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  return null;
}

export async function createSkuAction(input: z.input<typeof skuSchema>) {
  const membership = await requireMembership();
  if (membership.role !== "admin") return { ok: false, error: "Admin access required." };

  const parsed = skuSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter valid SKU and supplier details." };

  const supabase = await createClient();
  const whatsapp = normalizeWhatsAppNumber(parsed.data.country, parsed.data.phoneRaw);
  const { data: skuId, error } = await supabase.rpc("admin_create_sku", {
    p_organization_id: membership.organization_id,
    p_supplier_name: parsed.data.supplierName,
    p_contact_name: parsed.data.contactName || "",
    p_country: parsed.data.country,
    p_phone_raw: parsed.data.phoneRaw,
    p_whatsapp_number: whatsapp,
    p_sku_code: parsed.data.skuCode,
    p_name: parsed.data.productName,
    p_variant: parsed.data.variant || "",
    p_low_stock_qty: parsed.data.lowStockQty,
    p_max_stock_qty: parsed.data.maxStockQty,
    p_opening_stock: parsed.data.openingStock ?? 0,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  revalidatePath("/sku");
  revalidatePath("/reports");
  return { ok: true, skuId };
}

export async function updateSkuAction(input: z.input<typeof skuSchema>) {
  const membership = await requireMembership();
  if (membership.role !== "admin") return { ok: false, error: "Admin access required." };

  const parsed = skuSchema.extend({ skuId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter valid SKU and supplier details." };

  const supabase = await createClient();
  const whatsapp = normalizeWhatsAppNumber(parsed.data.country, parsed.data.phoneRaw);
  const { error } = await supabase.rpc("admin_update_sku", {
    p_sku_id: parsed.data.skuId,
    p_supplier_name: parsed.data.supplierName,
    p_contact_name: parsed.data.contactName || "",
    p_country: parsed.data.country,
    p_phone_raw: parsed.data.phoneRaw,
    p_whatsapp_number: whatsapp,
    p_sku_code: parsed.data.skuCode,
    p_name: parsed.data.productName,
    p_variant: parsed.data.variant || "",
    p_low_stock_qty: parsed.data.lowStockQty,
    p_max_stock_qty: parsed.data.maxStockQty,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  revalidatePath("/sku");
  revalidatePath("/reports");
  return { ok: true };
}

export async function archiveSkuAction(skuId: string) {
  const membership = await requireMembership();
  if (membership.role !== "admin") return { ok: false, error: "Admin access required." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_archive_sku", { p_sku_id: skuId });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  revalidatePath("/sku");
  revalidatePath("/reports");
  return { ok: true };
}

export async function uploadSkuPhotoAction(formData: FormData) {
  const membership = await requireMembership();
  if (membership.role !== "admin") return { ok: false, error: "Admin access required." };

  const skuId = String(formData.get("skuId") ?? "");
  const file = formData.get("photo");

  if (!z.string().uuid().safeParse(skuId).success) return { ok: false, error: "Select a valid SKU." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a photo to upload." };
  if (file.size > MAX_PHOTO_SIZE) return { ok: false, error: "Photo must be 5MB or smaller." };
  if (!allowedPhotoTypes.has(file.type)) return { ok: false, error: "Use JPG, PNG, WebP, or GIF." };

  const extension = extensionForPhoto(file);
  if (!extension) return { ok: false, error: "Unsupported photo type." };

  const supabase = await createClient();
  const { data: rows, error: rowError } = await supabase.rpc("get_admin_sku_manager_rows", { p_organization_id: membership.organization_id });
  if (rowError) return { ok: false, error: rowError.message };
  const row = (rows as AdminSkuManagerRow[] | null)?.find((item) => item.sku_id === skuId);
  if (!row) return { ok: false, error: "SKU not found." };

  const path = `${membership.organization_id}/${skuId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from(SKU_PHOTOS_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });

  if (uploadError) return { ok: false, error: uploadError.message };

  const { error: rpcError } = await supabase.rpc("admin_update_sku_photo", { p_sku_id: skuId, p_photo_path: path });
  if (rpcError) {
    await supabase.storage.from(SKU_PHOTOS_BUCKET).remove([path]);
    return { ok: false, error: rpcError.message };
  }

  if (row.photo_path) {
    await supabase.storage.from(SKU_PHOTOS_BUCKET).remove([row.photo_path]);
  }

  revalidatePath("/");
  revalidatePath("/sku");
  revalidatePath("/reports");
  return { ok: true };
}

export async function removeSkuPhotoAction(skuId: string) {
  const membership = await requireMembership();
  if (membership.role !== "admin") return { ok: false, error: "Admin access required." };
  if (!z.string().uuid().safeParse(skuId).success) return { ok: false, error: "Select a valid SKU." };

  const supabase = await createClient();
  const { data: rows, error: rowError } = await supabase.rpc("get_admin_sku_manager_rows", { p_organization_id: membership.organization_id });
  if (rowError) return { ok: false, error: rowError.message };
  const row = (rows as AdminSkuManagerRow[] | null)?.find((item) => item.sku_id === skuId);
  if (!row) return { ok: false, error: "SKU not found." };

  const { error: rpcError } = await supabase.rpc("admin_update_sku_photo", { p_sku_id: skuId, p_photo_path: null });
  if (rpcError) return { ok: false, error: rpcError.message };

  if (row.photo_path) {
    await supabase.storage.from(SKU_PHOTOS_BUCKET).remove([row.photo_path]);
  }

  revalidatePath("/");
  revalidatePath("/sku");
  revalidatePath("/reports");
  return { ok: true };
}
