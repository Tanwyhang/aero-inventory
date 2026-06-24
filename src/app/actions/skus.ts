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
  categoryName: z.string().trim().max(120).optional(),
  supplierName: z.string().trim().min(1).max(160),
  contactName: z.string().trim().max(120).optional(),
  country: z.enum(["MY", "TH"]),
  phoneRaw: z.string().trim().min(5).max(60),
  price: z.coerce.number().min(0).max(100000000),
  lowStockQty: z.coerce.number().int().min(0).max(100000),
  maxStockQty: z.coerce.number().int().min(0).max(100000),
  openingStock: z.coerce.number().int().min(0).max(100000).optional(),
  demoPhotoPath: z.string().trim().max(500).optional(),
});

const variationItemSchema = z.object({
  clientId: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  skuCode: z.string().trim().min(1).max(80),
  price: z.coerce.number().min(0).max(100000000),
  lowStockQty: z.coerce.number().int().min(0).max(100000),
  maxStockQty: z.coerce.number().int().min(0).max(100000),
  openingStock: z.coerce.number().int().min(0).max(100000),
});

const variationGroupSchema = z.object({
  variationGroupId: z.string().uuid().optional(),
  productName: z.string().trim().min(1).max(160),
  variationName: z.string().trim().min(1).max(80),
  addVariationImages: z.boolean(),
  categoryName: z.string().trim().max(120).optional(),
  supplierName: z.string().trim().min(1).max(160),
  contactName: z.string().trim().max(120).optional(),
  country: z.enum(["MY", "TH"]),
  phoneRaw: z.string().trim().min(5).max(60),
  items: z.array(variationItemSchema).min(1).max(100),
});

const categorySchema = z.object({
  name: z.string().trim().min(1).max(120),
});

const updateCategorySchema = categorySchema.extend({
  categoryId: z.string().uuid(),
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

function validatePhoto(file: File) {
  if (file.size === 0) return "Choose a photo to upload.";
  if (file.size > MAX_PHOTO_SIZE) return "Photo must be 5MB or smaller.";
  if (!allowedPhotoTypes.has(file.type)) return "Use JPG, PNG, WebP, or GIF.";
  if (!extensionForPhoto(file)) return "Unsupported photo type.";
  return null;
}

function hasDuplicate(values: string[]) {
  const normalized = values.map((value) => value.trim().toLowerCase()).filter(Boolean);
  return new Set(normalized).size !== normalized.length;
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
    p_price: parsed.data.price,
    p_low_stock_qty: parsed.data.lowStockQty,
    p_max_stock_qty: parsed.data.maxStockQty,
    p_opening_stock: parsed.data.openingStock ?? 0,
    p_category_name: parsed.data.categoryName || null,
  });

  if (error) return { ok: false, error: error.message };

  if (parsed.data.demoPhotoPath && skuId) {
    const { data: rows, error: rowError } = await supabase.rpc("get_admin_sku_manager_rows", { p_organization_id: membership.organization_id });
    const canUseDemoPhoto = !rowError && (rows as AdminSkuManagerRow[] | null)?.some((item) => item.photo_path === parsed.data.demoPhotoPath);

    if (canUseDemoPhoto) {
      const extension = parsed.data.demoPhotoPath.split(".").pop() || "jpg";
      const targetPath = `${membership.organization_id}/${skuId}/${crypto.randomUUID()}.${extension}`;
      const { error: copyError } = await supabase.storage.from(SKU_PHOTOS_BUCKET).copy(parsed.data.demoPhotoPath, targetPath);

      if (!copyError) {
        await supabase.rpc("admin_update_sku_photo", { p_sku_id: skuId, p_photo_path: targetPath });
      }
    }
  }

  revalidatePath("/");
  revalidatePath("/sku");
  revalidatePath("/reports");
  return { ok: true, skuId };
}

export async function createProductCategoryAction(input: z.input<typeof categorySchema>) {
  const membership = await requireMembership();
  if (membership.role !== "admin") return { ok: false, error: "Admin access required." };

  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid category name." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_upsert_product_category", {
    p_organization_id: membership.organization_id,
    p_name: parsed.data.name,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/sku");
  revalidatePath("/");
  revalidatePath("/partner-share");
  return { ok: true, categoryId: data };
}

export async function updateProductCategoryAction(input: z.input<typeof updateCategorySchema>) {
  const membership = await requireMembership();
  if (membership.role !== "admin") return { ok: false, error: "Admin access required." };

  const parsed = updateCategorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid category name." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_product_category", {
    p_category_id: parsed.data.categoryId,
    p_name: parsed.data.name,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/sku");
  revalidatePath("/");
  revalidatePath("/partner-share");
  return { ok: true };
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
    p_price: parsed.data.price,
    p_low_stock_qty: parsed.data.lowStockQty,
    p_max_stock_qty: parsed.data.maxStockQty,
    p_category_name: parsed.data.categoryName || null,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  revalidatePath("/sku");
  revalidatePath("/reports");
  return { ok: true };
}

export async function createVariationGroupAction(formData: FormData) {
  const membership = await requireMembership();
  if (membership.role !== "admin") return { ok: false, error: "Admin access required." };

  const payload = formData.get("payload");
  if (typeof payload !== "string") return { ok: false, error: "Enter valid variation details." };

  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return { ok: false, error: "Enter valid variation details." };
  }

  const parsed = variationGroupSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Enter valid variation details." };
  if (hasDuplicate(parsed.data.items.map((item) => item.name))) return { ok: false, error: "Variation item names must be unique." };
  if (hasDuplicate(parsed.data.items.map((item) => item.skuCode))) return { ok: false, error: "SKU IDs must be unique." };

  if (parsed.data.addVariationImages) {
    for (const item of parsed.data.items) {
      const photo = formData.get(`photo:${item.clientId}`);
      if (!(photo instanceof File)) return { ok: false, error: `Add a photo for ${item.name}.` };
      const photoError = validatePhoto(photo);
      if (photoError) return { ok: false, error: `${item.name}: ${photoError}` };
    }
  }

  const supabase = await createClient();
  const whatsapp = normalizeWhatsAppNumber(parsed.data.country, parsed.data.phoneRaw);
  let groupId = parsed.data.variationGroupId;

  if (groupId) {
    const { data: groupRow, error: groupLookupError } = await supabase
      .from("sku_variation_groups")
      .select("id")
      .eq("id", groupId)
      .eq("organization_id", membership.organization_id)
      .maybeSingle();

    if (groupLookupError || !groupRow) return { ok: false, error: "Variation group is not available in the selected workspace." };
  } else {
    const { data, error: groupError } = await supabase.rpc("admin_create_sku_variation_group", {
      p_organization_id: membership.organization_id,
      p_product_name: parsed.data.productName,
      p_variation_name: parsed.data.variationName,
      p_add_variation_images: parsed.data.addVariationImages,
    });

    if (groupError || !data) return { ok: false, error: groupError?.message ?? "Variation group creation failed." };
    groupId = data;
  }

  for (const item of parsed.data.items) {
    const { data: skuId, error } = await supabase.rpc("admin_create_sku", {
      p_organization_id: membership.organization_id,
      p_supplier_name: parsed.data.supplierName,
      p_contact_name: parsed.data.contactName || "",
      p_country: parsed.data.country,
      p_phone_raw: parsed.data.phoneRaw,
      p_whatsapp_number: whatsapp,
      p_sku_code: item.skuCode,
      p_name: parsed.data.productName,
      p_variant: item.name,
      p_price: item.price,
      p_low_stock_qty: item.lowStockQty,
      p_max_stock_qty: item.maxStockQty,
      p_opening_stock: item.openingStock,
      p_variation_group_id: groupId,
      p_category_name: parsed.data.categoryName || null,
    });

    if (error || !skuId) return { ok: false, error: error?.message ?? `SKU creation failed for ${item.name}.` };

    const photo = formData.get(`photo:${item.clientId}`);
    if (photo instanceof File && photo.size > 0) {
      const extension = extensionForPhoto(photo);
      if (!extension) return { ok: false, error: `${item.name}: Unsupported photo type.` };

      const path = `${membership.organization_id}/${skuId}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from(SKU_PHOTOS_BUCKET).upload(path, photo, {
        contentType: photo.type,
        upsert: false,
      });

      if (uploadError) return { ok: false, error: `${item.name}: ${uploadError.message}` };

      const { error: photoError } = await supabase.rpc("admin_update_sku_photo", { p_sku_id: skuId, p_photo_path: path });
      if (photoError) {
        await supabase.storage.from(SKU_PHOTOS_BUCKET).remove([path]);
        return { ok: false, error: `${item.name}: ${photoError.message}` };
      }
    }
  }

  revalidatePath("/");
  revalidatePath("/sku");
  revalidatePath("/reports");
  return { ok: true, variationGroupId: groupId };
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
