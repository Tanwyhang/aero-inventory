"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { safeActionError } from "@/lib/action-error";
import { requireMembership } from "@/lib/auth";
import { revalidateWorkspaceData } from "@/lib/cached-data";
import { optimizeProductImage } from "@/lib/optimize-image";
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

const managedVariationItemSchema = z.object({
  skuId: z.string().uuid(),
  locationId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  skuCode: z.string().trim().min(1).max(80),
  price: z.coerce.number().min(0).max(100000000),
  lowStockQty: z.coerce.number().int().min(0).max(100000),
  maxStockQty: z.coerce.number().int().min(0).max(100000),
  currentStock: z.coerce.number().int().min(0).max(100000000),
  originalStock: z.coerce.number().int().min(0).max(100000000),
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
  existingItems: z.array(managedVariationItemSchema).max(100).default([]),
  items: z.array(variationItemSchema).max(100),
}).superRefine((value, context) => {
  if (value.existingItems.length + value.items.length === 0) {
    context.addIssue({ code: "custom", message: "Add at least one SKU type." });
  }

  if (!value.variationGroupId && value.items.length === 0) {
    context.addIssue({ code: "custom", message: "A new variation group needs at least one new SKU type." });
  }

  if (value.existingItems.length + value.items.length > 100) {
    context.addIssue({ code: "custom", message: "A variation group can contain at most 100 SKU types." });
  }
});

const updateSkuSchema = skuSchema.extend({
  skuId: z.string().uuid(),
  locationId: z.string().uuid(),
  expectedStock: z.coerce.number().int().min(0).max(100000000),
  targetStock: z.coerce.number().int().min(0).max(100000000),
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

function revalidateSkuPages(organizationId: string, includePartnerShare = false) {
  revalidateWorkspaceData(organizationId);
  revalidatePath("/");
  revalidatePath("/sku");
  revalidatePath(includePartnerShare ? "/partner-share" : "/reports");
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

  if (error) return { ok: false, error: safeActionError(error, "createSkuAction.rpc", "SKU could not be created.") };

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

  revalidateSkuPages(membership.organization_id);
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

  if (error) return { ok: false, error: safeActionError(error, "createProductCategoryAction.rpc", "Category could not be saved.") };
  revalidateSkuPages(membership.organization_id, true);
  return { ok: true, categoryId: data };
}

export async function updateProductCategoryAction(input: z.input<typeof updateCategorySchema>) {
  const membership = await requireMembership();
  if (membership.role !== "admin") return { ok: false, error: "Admin access required." };

  const parsed = updateCategorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid category name." };

  const supabase = await createClient();
  const { data: categoryRow, error: categoryLookupError } = await supabase
    .from("product_categories")
    .select("id")
    .eq("id", parsed.data.categoryId)
    .eq("organization_id", membership.organization_id)
    .is("archived_at", null)
    .maybeSingle();

  if (categoryLookupError) {
    return { ok: false, error: safeActionError(categoryLookupError, "updateProductCategoryAction.lookup", "Category could not be checked.") };
  }

  if (!categoryRow) {
    return { ok: false, error: "Category is not available in the selected workspace." };
  }

  const { error } = await supabase.rpc("admin_update_product_category", {
    p_category_id: parsed.data.categoryId,
    p_name: parsed.data.name,
  });

  if (error) return { ok: false, error: safeActionError(error, "updateProductCategoryAction.rpc", "Category could not be updated.") };
  revalidateSkuPages(membership.organization_id, true);
  return { ok: true };
}

export async function archiveProductCategoryAction(categoryId: string) {
  const membership = await requireMembership();
  if (membership.role !== "admin") return { ok: false, error: "Admin access required." };

  const parsed = z.string().uuid().safeParse(categoryId);
  if (!parsed.success) return { ok: false, error: "Choose a valid category." };

  const supabase = await createClient();
  const { data: categoryRow, error: categoryLookupError } = await supabase
    .from("product_categories")
    .select("id")
    .eq("id", parsed.data)
    .eq("organization_id", membership.organization_id)
    .is("archived_at", null)
    .maybeSingle();

  if (categoryLookupError) {
    return { ok: false, error: safeActionError(categoryLookupError, "archiveProductCategoryAction.lookup", "Category could not be checked.") };
  }
  if (!categoryRow) return { ok: false, error: "Category is not available in the selected workspace." };

  const { error } = await supabase.rpc("admin_archive_product_category", { p_category_id: parsed.data });
  if (error) return { ok: false, error: safeActionError(error, "archiveProductCategoryAction.rpc", "Category could not be deleted.") };

  revalidateSkuPages(membership.organization_id, true);
  return { ok: true };
}

export async function updateSkuAction(input: z.input<typeof updateSkuSchema>) {
  const membership = await requireMembership();
  if (membership.role !== "admin") return { ok: false, error: "Admin access required." };

  const parsed = updateSkuSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter valid SKU and supplier details." };

  const supabase = await createClient();
  const whatsapp = normalizeWhatsAppNumber(parsed.data.country, parsed.data.phoneRaw);
  const { error } = await supabase.rpc("admin_update_sku_with_stock", {
    p_organization_id: membership.organization_id,
    p_sku_id: parsed.data.skuId,
    p_location_id: parsed.data.locationId,
    p_expected_quantity: parsed.data.expectedStock,
    p_target_quantity: parsed.data.targetStock,
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

  if (error) return { ok: false, error: safeActionError(error, "updateSkuAction.rpc", "SKU could not be updated.") };
  revalidateSkuPages(membership.organization_id);
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
  const allItemNames = [...parsed.data.existingItems.map((item) => item.name), ...parsed.data.items.map((item) => item.name)];
  const allSkuCodes = [...parsed.data.existingItems.map((item) => item.skuCode), ...parsed.data.items.map((item) => item.skuCode)];
  if (hasDuplicate(allItemNames)) return { ok: false, error: "Variation item names must be unique." };
  if (hasDuplicate(allSkuCodes)) return { ok: false, error: "SKU IDs must be unique." };

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
  const rpcItems = [
    ...parsed.data.existingItems.map((item) => ({
      client_id: item.skuId,
      sku_id: item.skuId,
      location_id: item.locationId,
      name: item.name,
      sku_code: item.skuCode,
      price: item.price,
      low_stock_qty: item.lowStockQty,
      max_stock_qty: item.maxStockQty,
      expected_quantity: item.originalStock,
      target_quantity: item.currentStock,
    })),
    ...parsed.data.items.map((item) => ({
      client_id: item.clientId,
      sku_id: null,
      name: item.name,
      sku_code: item.skuCode,
      price: item.price,
      low_stock_qty: item.lowStockQty,
      max_stock_qty: item.maxStockQty,
      opening_stock: item.openingStock,
    })),
  ];
  const { data, error } = await supabase.rpc("admin_save_sku_variation_group", {
    p_organization_id: membership.organization_id,
    p_variation_group_id: parsed.data.variationGroupId ?? null,
    p_product_name: parsed.data.productName,
    p_variation_name: parsed.data.variationName,
    p_add_variation_images: parsed.data.addVariationImages,
    p_supplier_name: parsed.data.supplierName,
    p_contact_name: parsed.data.contactName || "",
    p_country: parsed.data.country,
    p_phone_raw: parsed.data.phoneRaw,
    p_whatsapp_number: whatsapp,
    p_category_name: parsed.data.categoryName || null,
    p_items: rpcItems,
  });

  if (error) return { ok: false, error: safeActionError(error, "createVariationGroupAction.rpc", "SKU types could not be saved.") };

  const savedResult = data && typeof data === "object" && !Array.isArray(data)
    ? data as { variation_group_id?: unknown; items?: unknown }
    : null;
  const savedItems = Array.isArray(savedResult?.items)
    ? savedResult.items.filter((item): item is { client_id: string; sku_id: string } => (
        Boolean(item)
        && typeof item === "object"
        && typeof (item as { client_id?: unknown }).client_id === "string"
        && typeof (item as { sku_id?: unknown }).sku_id === "string"
      ))
    : [];
  const skuIdByClientId = new Map(savedItems.map((item) => [item.client_id, item.sku_id]));
  const warnings: string[] = [];

  for (const item of parsed.data.items) {
    const photo = formData.get(`photo:${item.clientId}`);
    if (!(photo instanceof File) || photo.size === 0) continue;

    const skuId = skuIdByClientId.get(item.clientId);
    if (!skuId) {
      warnings.push(`${item.name}: SKU saved, but the photo could not be linked. Reopen the SKU to retry.`);
      continue;
    }

    const extension = extensionForPhoto(photo);
    if (!extension) {
      warnings.push(`${item.name}: SKU saved, but the photo type was not supported.`);
      continue;
    }

    const optimizedPhoto = await optimizeProductImage(photo, extension);
    const path = `${membership.organization_id}/${skuId}/${crypto.randomUUID()}.${optimizedPhoto.extension}`;

    try {
      const { error: uploadError } = await supabase.storage.from(SKU_PHOTOS_BUCKET).upload(path, optimizedPhoto.body, {
        contentType: optimizedPhoto.contentType,
        upsert: false,
      });

      if (uploadError) {
        warnings.push(`${item.name}: SKU saved, but photo upload failed. Reopen the SKU to retry.`);
        continue;
      }

      const { error: photoError } = await supabase.rpc("admin_update_sku_photo", { p_sku_id: skuId, p_photo_path: path });
      if (photoError) {
        await supabase.storage.from(SKU_PHOTOS_BUCKET).remove([path]);
        warnings.push(`${item.name}: SKU saved, but the photo could not be linked. Reopen the SKU to retry.`);
      }
    } catch {
      warnings.push(`${item.name}: SKU saved, but photo upload was interrupted. Reopen the SKU to retry.`);
    }
  }

  revalidateSkuPages(membership.organization_id);
  return {
    ok: true,
    variationGroupId: typeof savedResult?.variation_group_id === "string" ? savedResult.variation_group_id : parsed.data.variationGroupId,
    warnings,
  };
}

export async function archiveSkuAction(skuId: string) {
  const membership = await requireMembership();
  if (membership.role !== "admin") return { ok: false, error: "Admin access required." };

  const parsed = z.string().uuid().safeParse(skuId);
  if (!parsed.success) return { ok: false, error: "Select a valid SKU." };

  const supabase = await createClient();
  const { data: skuRow, error: skuLookupError } = await supabase
    .from("skus")
    .select("id")
    .eq("id", parsed.data)
    .eq("organization_id", membership.organization_id)
    .eq("is_active", true)
    .is("archived_at", null)
    .maybeSingle();

  if (skuLookupError) {
    return { ok: false, error: safeActionError(skuLookupError, "archiveSkuAction.lookup", "SKU could not be checked.") };
  }

  if (!skuRow) {
    return { ok: false, error: "SKU is not available in the selected workspace." };
  }

  const { error } = await supabase.rpc("admin_archive_sku", { p_sku_id: parsed.data });

  if (error) return { ok: false, error: safeActionError(error, "archiveSkuAction.rpc", "SKU could not be archived.") };
  revalidateSkuPages(membership.organization_id);
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
  if (rowError) return { ok: false, error: safeActionError(rowError, "uploadSkuPhotoAction.lookup", "SKU photo could not be checked.") };
  const row = (rows as AdminSkuManagerRow[] | null)?.find((item) => item.sku_id === skuId);
  if (!row) return { ok: false, error: "SKU not found." };

  const optimizedPhoto = await optimizeProductImage(file, extension);
  const path = `${membership.organization_id}/${skuId}/${crypto.randomUUID()}.${optimizedPhoto.extension}`;
  const { error: uploadError } = await supabase.storage.from(SKU_PHOTOS_BUCKET).upload(path, optimizedPhoto.body, {
    contentType: optimizedPhoto.contentType,
    upsert: false,
  });

  if (uploadError) return { ok: false, error: safeActionError(uploadError, "uploadSkuPhotoAction.storage", "Photo could not be uploaded.") };

  const { error: rpcError } = await supabase.rpc("admin_update_sku_photo", { p_sku_id: skuId, p_photo_path: path });
  if (rpcError) {
    await supabase.storage.from(SKU_PHOTOS_BUCKET).remove([path]);
    return { ok: false, error: safeActionError(rpcError, "uploadSkuPhotoAction.rpc", "Photo could not be linked to the SKU.") };
  }

  if (row.photo_path) {
    await supabase.storage.from(SKU_PHOTOS_BUCKET).remove([row.photo_path]);
  }

  revalidateSkuPages(membership.organization_id);
  return { ok: true };
}

export async function removeSkuPhotoAction(skuId: string) {
  const membership = await requireMembership();
  if (membership.role !== "admin") return { ok: false, error: "Admin access required." };
  if (!z.string().uuid().safeParse(skuId).success) return { ok: false, error: "Select a valid SKU." };

  const supabase = await createClient();
  const { data: rows, error: rowError } = await supabase.rpc("get_admin_sku_manager_rows", { p_organization_id: membership.organization_id });
  if (rowError) return { ok: false, error: safeActionError(rowError, "removeSkuPhotoAction.lookup", "SKU photo could not be checked.") };
  const row = (rows as AdminSkuManagerRow[] | null)?.find((item) => item.sku_id === skuId);
  if (!row) return { ok: false, error: "SKU not found." };

  const { error: rpcError } = await supabase.rpc("admin_update_sku_photo", { p_sku_id: skuId, p_photo_path: null });
  if (rpcError) return { ok: false, error: safeActionError(rpcError, "removeSkuPhotoAction.rpc", "Photo could not be removed.") };

  if (row.photo_path) {
    await supabase.storage.from(SKU_PHOTOS_BUCKET).remove([row.photo_path]);
  }

  revalidateSkuPages(membership.organization_id);
  return { ok: true };
}
