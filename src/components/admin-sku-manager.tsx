"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronDown, ImageIcon, Pencil, Plus, Save, Search, Trash2, X } from "lucide-react";

import { adjustStockAction } from "@/app/actions/stock";
import { archiveSkuAction, createProductCategoryAction, createSkuAction, createVariationGroupAction, removeSkuPhotoAction, updateProductCategoryAction, updateSkuAction, uploadSkuPhotoAction } from "@/app/actions/skus";
import { AppSidebar } from "@/components/app-sidebar";
import { ConfirmSlideSheet, type ConfirmationRecord } from "@/components/confirm-slide-sheet";
import { FluidEntrySurface } from "@/components/fluid-entry-surface";
import { StoreIdentityEditor } from "@/components/store-identity-editor";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LumaSpinner } from "@/components/ui/luma-spinner";
import { toast } from "@/components/ui/toast";
import { DEFAULT_STOCK_ADJUSTMENT_REASON } from "@/lib/stock-reasons";
import type { AdminSkuManagerRow, Membership } from "@/types/database";

type Draft = {
  skuId?: string;
  locationId?: string;
  productName: string;
  variant: string;
  skuCode: string;
  categoryName: string;
  supplierName: string;
  contactName: string;
  country: "MY" | "TH";
  phoneRaw: string;
  price: string;
  lowStockQty: string;
  maxStockQty: string;
  openingStock: string;
  originalStock: string;
  photoUrl: string | null;
  photoPath: string | null;
  demoPhotoPath?: string;
};

type CreateMode = "single" | "variation";

type VariationItemDraft = {
  clientId: string;
  name: string;
  skuCode: string;
  price: string;
  lowStockQty: string;
  maxStockQty: string;
  openingStock: string;
  photoFile: File | null;
};

type VariationDraft = {
  variationGroupId?: string;
  productName: string;
  variationName: string;
  addVariationImages: boolean;
  categoryName: string;
  supplierName: string;
  contactName: string;
  country: "MY" | "TH";
  phoneRaw: string;
  items: VariationItemDraft[];
};

type PendingConfirmation = {
  title: string;
  description: string;
  records: ConfirmationRecord[];
  onConfirm: () => Promise<void>;
  onCancel?: () => void;
};

type ProductCategory = {
  id: string;
  name: string;
};

const demoDraft: Draft = {
  productName: "Demo Pet Shampoo",
  variant: "500ml",
  skuCode: "DEMO-SHAMPOO-500ML",
  categoryName: "Grooming",
  supplierName: "Demo Pet Supply",
  contactName: "Maya",
  country: "MY",
  phoneRaw: "012-345 6789",
  price: "0",
  lowStockQty: "8",
  maxStockQty: "60",
  openingStock: "24",
  originalStock: "24",
  photoUrl: null,
  photoPath: null,
};

const inputClassName = "h-12 w-full min-w-0 rounded-xl border-2 border-zinc-300 bg-white px-4 font-semibold outline-none transition placeholder:text-zinc-400 focus:border-black focus:ring-2 focus:ring-lime";

function newVariationItem(index: number): VariationItemDraft {
  const suffix = Date.now().toString().slice(-5);

  return {
    clientId: crypto.randomUUID(),
    name: "",
    skuCode: `VAR-${suffix}-${index}`,
    price: "0",
    lowStockQty: "8",
    maxStockQty: "60",
    openingStock: "0",
    photoFile: null,
  };
}

function newVariationDraft(): VariationDraft {
  return {
    variationGroupId: undefined,
    productName: "Demo Cat Food",
    variationName: "Flavor",
    addVariationImages: true,
    categoryName: "Cat Food",
    supplierName: "Demo Pet Supply",
    contactName: "Maya",
    country: "MY",
    phoneRaw: "012-345 6789",
    items: [newVariationItem(1)],
  };
}

function formatPrice(price: number | string | null | undefined) {
  return `RM ${Number(price ?? 0).toFixed(2)}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid min-w-0 gap-2 text-sm font-black tracking-[-0.02em] text-zinc-700">{label}{children}</label>;
}

function stockProgress(stock: number, lowStock: number) {
  if (lowStock <= 0) return stock > 0 ? 100 : 0;
  return Math.max(0, Math.min((stock / lowStock) * 100, 100));
}

function stockProgressColor(stock: number, lowStock: number) {
  if (stock <= 0) return "bg-red-500";
  if (stock <= lowStock) return "bg-orange";
  return "bg-lime";
}

function StockStat({ quantity, lowStock }: { quantity: number; lowStock: number }) {
  return (
    <div className="grid w-full max-w-[120px] min-w-[96px] gap-1">
      <div className="flex items-baseline gap-1 font-bold tabular-nums">
        <span className={quantity <= lowStock ? "text-orange" : "text-zinc-900"}>{quantity}</span>
        <span className="text-[11px] font-semibold text-zinc-400">Low {lowStock}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
        <div className={`h-full rounded-full ${stockProgressColor(quantity, lowStock)}`} style={{ width: `${stockProgress(quantity, lowStock)}%` }} />
      </div>
    </div>
  );
}

function CategoryDropdown({
  value,
  categories,
  onChange,
  onAdd,
  onEdit,
  isEditorOpen,
  categoryDraft,
  editingCategoryId,
  isCategoryPending,
  onCategoryDraftChange,
  onSaveCategory,
  onCancelCategory,
}: {
  value: string;
  categories: ProductCategory[];
  onChange: (value: string) => void;
  onAdd: () => void;
  onEdit: (category: ProductCategory) => void;
  isEditorOpen: boolean;
  categoryDraft: string;
  editingCategoryId: string | null;
  isCategoryPending: boolean;
  onCategoryDraftChange: (value: string) => void;
  onSaveCategory: () => Promise<boolean>;
  onCancelCategory: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button type="button" className={inputClassName}>
          <span className="flex min-w-0 items-center justify-between gap-3">
            <span className={value ? "truncate text-black" : "truncate text-zinc-400"}>{value || "Choose category"}</span>
            <ChevronDown className="size-4 shrink-0 text-zinc-500" />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[min(22rem,calc(100vw-2rem))]">
        <DropdownMenuLabel>Categories</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => { onCancelCategory(); onChange(""); }}>No category</DropdownMenuItem>
        <div className="grid gap-1 px-1">
          {categories.map((category) => (
            <div key={category.id} className="flex min-w-0 items-center gap-1 rounded-md hover:bg-zinc-100">
              <button
                type="button"
                className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm font-semibold"
                onClick={() => {
                  onCancelCategory();
                  onChange(category.name);
                  setIsOpen(false);
                }}
              >
                {category.name}
              </button>
              <Button type="button" variant="ghost" size="icon" onClick={() => onEdit(category)} aria-label={`Edit ${category.name}`}>
                <Pencil className="size-4" />
              </Button>
            </div>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={(event) => { event.preventDefault(); onAdd(); }}><Plus className="size-4" />Add category</DropdownMenuItem>
        {isEditorOpen ? (
          <>
            <DropdownMenuSeparator />
            <form
              className="grid gap-2 p-2"
              onSubmit={async (event) => {
                event.preventDefault();
                const saved = await onSaveCategory();
                if (saved) setIsOpen(false);
              }}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <div className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{editingCategoryId ? "Edit Category" : "Add Category"}</div>
              <input autoFocus autoComplete="off" value={categoryDraft} onChange={(event) => onCategoryDraftChange(event.target.value)} className={inputClassName} placeholder="Food, Grooming, Treats" />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onCancelCategory}>Cancel</Button>
                <Button type="submit" size="sm" disabled={!categoryDraft.trim() || isCategoryPending}>{isCategoryPending ? "Saving..." : editingCategoryId ? "Save" : "Add"}</Button>
              </div>
            </form>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/50 bg-white/55 p-5 backdrop-blur-lg">
      <h3 className="text-sm font-black uppercase tracking-[0.14em] text-zinc-500">{title}</h3>
      <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-2">{children}</div>
    </section>
  );
}

function PhotoPicker({
  photoUrl,
  photoFile,
  onPhotoChange,
}: {
  photoUrl: string | null;
  photoFile: File | null;
  onPhotoChange: (file: File | null) => void;
}) {
  return (
    <label className="group grid cursor-pointer gap-2 text-sm font-black tracking-[-0.02em] text-zinc-700">
      Product Photo
      <div className="grid aspect-square w-full max-w-[180px] place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-zinc-300 bg-white transition group-hover:border-black group-focus-within:border-black group-focus-within:ring-2 group-focus-within:ring-lime">
        {photoUrl ? (
          <Image src={photoUrl} alt="Product photo" width={180} height={180} className="size-full object-cover" />
        ) : (
          <div className="grid gap-2 text-center text-zinc-500">
            <ImageIcon className="mx-auto size-8" />
            <span className="text-xs font-bold">Tap to add</span>
          </div>
        )}
      </div>
      <span className="text-xs font-semibold text-zinc-500">{photoFile ? photoFile.name : "Choose from gallery"}</span>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={(event) => onPhotoChange(event.target.files?.[0] ?? null)}
      />
    </label>
  );
}

export function AdminSkuManager({ membership, rows, categories, restockCount = 0 }: { membership: Membership; rows: AdminSkuManagerRow[]; categories: ProductCategory[]; restockCount?: number }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(demoDraft);
  const [createMode, setCreateMode] = useState<CreateMode>("single");
  const [variationDraft, setVariationDraft] = useState<VariationDraft>(() => newVariationDraft());
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isPhotoPending, setIsPhotoPending] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [variationNotice, setVariationNotice] = useState<string | null>(null);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [isCategoryEditorOpen, setIsCategoryEditorOpen] = useState(false);
  const [isCategoryPending, setIsCategoryPending] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const isEditing = Boolean(draft.skuId);
  const selectedPhotoUrl = useMemo(() => (photoFile ? URL.createObjectURL(photoFile) : null), [photoFile]);
  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesCategory = categoryFilter === "all" || (row.category_name ?? "") === categoryFilter;
      const haystack = [row.product_name, row.variant, row.sku_code, row.category_name, row.supplier_name, row.variation_name].filter(Boolean).join(" ").toLowerCase();
      return matchesCategory && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [categoryFilter, query, rows]);
  const tableEntries = useMemo(() => {
    const entries: Array<
      | { type: "group"; id: string; productName: string; variationName: string; rows: AdminSkuManagerRow[] }
      | { type: "sku"; row: AdminSkuManagerRow }
    > = [];
    const grouped = new Map<string, AdminSkuManagerRow[]>();
    const singles: AdminSkuManagerRow[] = [];

    for (const row of filteredRows) {
      if (!row.variation_group_id) {
        singles.push(row);
        continue;
      }

      const groupRows = grouped.get(row.variation_group_id) ?? [];
      groupRows.push(row);
      grouped.set(row.variation_group_id, groupRows);
    }

    for (const [id, groupRows] of grouped) {
      const first = groupRows[0];
      entries.push({ type: "group", id, productName: first.product_name, variationName: first.variation_name ?? "Variation", rows: groupRows });
    }

    for (const row of singles) entries.push({ type: "sku", row });

    return entries;
  }, [filteredRows]);

  useEffect(() => {
    return () => {
      if (selectedPhotoUrl) URL.revokeObjectURL(selectedPhotoUrl);
    };
  }, [selectedPhotoUrl]);

  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateVariationDraft<K extends keyof VariationDraft>(key: K, value: VariationDraft[K]) {
    setVariationDraft((current) => ({ ...current, [key]: value }));
  }

  function updateVariationItem<K extends keyof VariationItemDraft>(clientId: string, key: K, value: VariationItemDraft[K]) {
    setVariationDraft((current) => ({
      ...current,
      items: current.items.map((item) => (item.clientId === clientId ? { ...item, [key]: value } : item)),
    }));
  }

  function normalizedSkuDraft() {
    const lowStockQty = Number(draft.lowStockQty || 0);
    const openingStock = Number(draft.openingStock || 0);

    return {
      ...draft,
      price: Number(draft.price || 0),
      lowStockQty,
      maxStockQty: Math.max(lowStockQty, openingStock, Number(draft.maxStockQty || 0)),
      openingStock,
    };
  }

  function normalizedVariationItems() {
    return variationDraft.items.map((item) => {
      const lowStockQty = Number(item.lowStockQty || 0);
      const openingStock = Number(item.openingStock || 0);

      return {
        clientId: item.clientId,
        name: item.name,
        skuCode: item.skuCode,
        price: Number(item.price || 0),
        lowStockQty,
        maxStockQty: Math.max(lowStockQty, openingStock, Number(item.maxStockQty || 0)),
        openingStock,
      };
    });
  }

  function startCategoryAdd() {
    setEditingCategoryId(null);
    setCategoryDraft("");
    setIsCategoryEditorOpen(true);
  }

  function startCategoryEdit(category: ProductCategory) {
    setEditingCategoryId(category.id);
    setCategoryDraft(category.name);
    setIsCategoryEditorOpen(true);
  }

  function addVariationItem() {
    const nextIndex = variationDraft.items.length + 1;
    const nextItem = newVariationItem(nextIndex);

    setVariationDraft((current) => ({
      ...current,
      items: [...current.items, nextItem],
    }));
    setVariationNotice(`Type ${nextIndex} added. ${nextIndex} new types queued.`);
    toast.success("Type added", { description: `Type ${nextIndex} is queued. Review and save to apply it.` });
  }

  function openAppendVariation(row: AdminSkuManagerRow, groupRows?: AdminSkuManagerRow[]) {
    const sourceRows = groupRows?.length ? groupRows : [row];
    const first = sourceRows[0];

    setCreateMode("variation");
    setDraft({
      ...demoDraft,
      productName: first.product_name,
      categoryName: first.category_name ?? "",
      supplierName: first.supplier_name ?? demoDraft.supplierName,
      contactName: first.contact_name ?? "",
      country: first.country === "TH" ? "TH" : "MY",
      phoneRaw: first.phone_raw ?? demoDraft.phoneRaw,
      photoUrl: first.photo_url ?? null,
      photoPath: first.photo_path,
    });
    setVariationDraft({
      variationGroupId: first.variation_group_id ?? undefined,
      productName: first.product_name,
      variationName: first.variation_name ?? "Variation",
      addVariationImages: Boolean(first.add_variation_images),
      categoryName: first.category_name ?? "",
      supplierName: first.supplier_name ?? demoDraft.supplierName,
      contactName: first.contact_name ?? "",
      country: first.country === "TH" ? "TH" : "MY",
      phoneRaw: first.phone_raw ?? demoDraft.phoneRaw,
      items: [newVariationItem(sourceRows.length + 1)],
    });
    setVariationNotice("1 new type queued. Review and save to apply it.");
    setPhotoFile(null);
    setError(null);
    setIsOpen(true);
  }

  function removeVariationItem(clientId: string) {
    if (variationDraft.items.length <= 1) return;

    const item = variationDraft.items.find((draftItem) => draftItem.clientId === clientId);
    const itemIndex = variationDraft.items.findIndex((draftItem) => draftItem.clientId === clientId) + 1;
    if (!item) return;

    setConfirmError(null);
    setConfirmation({
      title: "Remove Type?",
      description: "This removes the queued type from this bundle before saving. Existing saved SKUs are not changed until you confirm a delete from Edit.",
      records: [
        { label: "Bundle", value: variationDraft.productName },
        { label: "Type Slot", value: `Type ${itemIndex}` },
        { label: "Type Name", value: item.name || "Not named yet" },
        { label: "SKU", value: item.skuCode || "Not set yet" },
        { label: "Queued Types", value: `${variationDraft.items.length} -> ${variationDraft.items.length - 1}` },
      ],
      onConfirm: async () => {
        const nextCount = variationDraft.items.length - 1;
        setVariationDraft((current) => ({
          ...current,
          items: current.items.length > 1 ? current.items.filter((draftItem) => draftItem.clientId !== clientId) : current.items,
        }));
        setVariationNotice(`Type ${itemIndex} removed. ${nextCount} new ${nextCount === 1 ? "type" : "types"} still queued.`);
        toast.success("Type removed", { description: `${item.name || `Type ${itemIndex}`} was removed from the pending bundle update.` });
        setConfirmation(null);
      },
    });
  }

  function openCreate() {
    const demoPhotoRow = rows.find((row) => row.photo_url && row.photo_path);

    setDraft({
      ...demoDraft,
      skuCode: `DEMO-${Date.now().toString().slice(-5)}`,
      categoryName: demoDraft.categoryName,
      photoUrl: demoPhotoRow?.photo_url ?? null,
      photoPath: demoPhotoRow?.photo_path ?? null,
      demoPhotoPath: demoPhotoRow?.photo_path ?? undefined,
    });
    setCreateMode("single");
    setVariationDraft(newVariationDraft());
    setVariationNotice(null);
    setPhotoFile(null);
    setError(null);
    setIsOpen(true);
  }

  function openEdit(row: AdminSkuManagerRow) {
    setDraft({
      skuId: row.sku_id,
      locationId: row.location_id,
      productName: row.product_name,
      variant: row.variant ?? "",
      skuCode: row.sku_code,
      categoryName: row.category_name ?? "",
      supplierName: row.supplier_name ?? "",
      contactName: row.contact_name ?? "",
      country: row.country === "TH" ? "TH" : "MY",
      phoneRaw: row.phone_raw ?? "",
      price: String(row.price ?? 0),
      lowStockQty: String(row.low_stock_qty),
      maxStockQty: String(row.max_stock_qty),
      openingStock: String(row.quantity),
      originalStock: String(row.quantity),
      photoUrl: row.photo_url ?? null,
      photoPath: row.photo_path,
      demoPhotoPath: undefined,
    });
    setCreateMode("single");
    setVariationNotice(null);
    setError(null);
    setIsOpen(true);
  }

  function handleVariationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setConfirmError(null);

    if (variationDraft.addVariationImages && variationDraft.items.some((item) => !item.photoFile)) {
      setError("Add a photo for every type, or turn off type images.");
      return;
    }

    setConfirmation({
      title: "Confirm SKU Types",
      description: "This will create a main SKU and record every type as a real inventory SKU.",
      records: [
        { label: "Product", value: variationDraft.productName },
        { label: "Type", value: variationDraft.variationName },
        { label: "Mode", value: variationDraft.variationGroupId ? "Add types to main SKU" : "Create main SKU" },
        { label: "Category", value: variationDraft.categoryName },
        { label: "Types", value: variationDraft.items.length },
        { label: "Supplier", value: variationDraft.supplierName },
        { label: "Contact", value: variationDraft.contactName || variationDraft.phoneRaw },
        { label: "Images", value: variationDraft.addVariationImages ? "Required per type" : "Not required" },
        { label: "Type Details", value: normalizedVariationItems().map((item, index) => `${index + 1}. ${item.name || "Unnamed"} (${item.skuCode || "No SKU"})`).join("; ") },
        { label: "Starting Stock", value: normalizedVariationItems().reduce((sum, item) => sum + item.openingStock, 0) },
      ],
      onConfirm: executeVariationSave,
    });
  }

  async function executeVariationSave() {
    setIsPending(true);
    setConfirmError(null);
    const formData = new FormData();
    formData.set("payload", JSON.stringify({
      productName: variationDraft.productName,
      variationGroupId: variationDraft.variationGroupId,
      variationName: variationDraft.variationName,
      addVariationImages: variationDraft.addVariationImages,
      categoryName: variationDraft.categoryName,
      supplierName: variationDraft.supplierName,
      contactName: variationDraft.contactName,
      country: variationDraft.country,
      phoneRaw: variationDraft.phoneRaw,
        items: normalizedVariationItems(),
    }));

    if (variationDraft.addVariationImages) {
      for (const item of variationDraft.items) {
        if (item.photoFile) formData.set(`photo:${item.clientId}`, item.photoFile);
      }
    }

    const result = await createVariationGroupAction(formData);
    setIsPending(false);

    if (result.ok !== true) {
      const message = result.error ?? "Variation group save failed.";
      setConfirmError(message);
      toast.error("Variation save failed", { description: message });
      throw new Error(message);
    }

    toast.success(variationDraft.variationGroupId ? "SKU types added" : "SKU types recorded", { description: `${variationDraft.productName}: ${variationDraft.items.length} types created.` });
    setConfirmation(null);
    setIsOpen(false);
    setCreateMode("single");
    setVariationDraft(newVariationDraft());
    setVariationNotice(null);
    router.refresh();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setConfirmError(null);

    if (isEditing) {
      const nextStock = Number(draft.openingStock || 0);
      if (!Number.isInteger(nextStock) || nextStock < 0) {
        setError("Enter a valid current stock count.");
        return;
      }
    }

    setConfirmation({
      title: isEditing ? "Confirm SKU Update" : "Confirm New SKU",
      description: isEditing ? "This will update SKU details and write an audit record." : "This will create a SKU, inventory row, and starting stock record.",
      records: [
        { label: "Product", value: draft.productName },
        { label: "Variant", value: draft.variant },
        { label: "SKU", value: draft.skuCode },
        { label: "Category", value: draft.categoryName },
        { label: "Price", value: formatPrice(draft.price) },
        { label: "Supplier", value: draft.supplierName },
        { label: "Contact", value: draft.contactName || draft.phoneRaw },
        { label: "Low at", value: draft.lowStockQty },
        { label: isEditing ? "Current Stock" : "Starting Stock", value: isEditing ? `${draft.originalStock} -> ${draft.openingStock}` : draft.openingStock },
        ...(isEditing ? [{ label: "Photo Change", value: photoFile ? photoFile.name : "No photo change" }] : []),
      ],
      onConfirm: executeSingleSkuSave,
    });
  }

  async function executeSingleSkuSave() {
    setIsPending(true);
    setConfirmError(null);
    const payload = normalizedSkuDraft();
    const result = isEditing ? await updateSkuAction(payload) : await createSkuAction(payload);

    if (result.ok !== true) {
      setIsPending(false);
      const message = result.error ?? "SKU save failed.";
      setConfirmError(message);
      toast.error("SKU save failed", { description: message });
      throw new Error(message);
    }

    const createdSkuId = "skuId" in result && typeof result.skuId === "string" ? result.skuId : undefined;
    const skuId = draft.skuId ?? createdSkuId;

    if (isEditing && draft.locationId) {
      const previousStock = Number(draft.originalStock || 0);
      const nextStock = Number(draft.openingStock || 0);
      const delta = nextStock - previousStock;

      if (!Number.isInteger(nextStock) || nextStock < 0) {
        setIsPending(false);
        const message = "Enter a valid current stock count.";
        setConfirmError(message);
        toast.error("Stock update failed", { description: message });
        throw new Error(message);
      }

      if (delta !== 0) {
        const stockResult = await adjustStockAction({
          skuId: draft.skuId ?? "",
          locationId: draft.locationId,
          movement: delta,
          reason: DEFAULT_STOCK_ADJUSTMENT_REASON,
          note: "Updated from SKU edit modal",
        });

        if (!stockResult.ok) {
          setIsPending(false);
          const message = stockResult.error ?? "Stock update failed.";
          setConfirmError(message);
          toast.error("Stock update failed", { description: message });
          throw new Error(message);
        }
      }
    }

    if (photoFile && skuId) {
      const formData = new FormData();
      formData.set("skuId", skuId);
      formData.set("photo", photoFile);
      const photoResult = await uploadSkuPhotoAction(formData);

      if (!photoResult.ok) {
        setIsPending(false);
        const message = photoResult.error ?? "SKU saved, but photo upload failed.";
        setConfirmError(message);
        toast.error("Photo upload failed", { description: message });
        throw new Error(message);
      }
    }

    setIsPending(false);

    toast.success(isEditing ? "SKU update recorded" : "SKU created", { description: `${payload.productName} (${payload.skuCode})` });
    setConfirmation(null);
    setIsOpen(false);
    setDraft({ ...demoDraft });
    setPhotoFile(null);
    router.refresh();
  }

  async function saveCategory() {
    const name = categoryDraft.trim();
    if (!name) return false;
    setIsCategoryPending(true);
    setError(null);
    const result = editingCategoryId ? await updateProductCategoryAction({ categoryId: editingCategoryId, name }) : await createProductCategoryAction({ name });
    setIsCategoryPending(false);
    if (!result.ok) {
      const message = result.error ?? "Category save failed.";
      setError(message);
      toast.error("Category save failed", { description: message });
      return false;
    }
    toast.success(editingCategoryId ? "Category updated" : "Category recorded", { description: name });
    setDraft((current) => ({ ...current, categoryName: name }));
    setVariationDraft((current) => ({ ...current, categoryName: name }));
    setCategoryDraft("");
    setEditingCategoryId(null);
    setIsCategoryEditorOpen(false);
    router.refresh();
    return true;
  }

  function archiveCurrentSku() {
    if (!draft.skuId) return;
    setConfirmError(null);
    setConfirmation({
      title: "Confirm SKU Delete",
      description: "This will delete the SKU and remove it from active inventory views.",
      records: [
        { label: "Product", value: draft.productName },
        { label: "Variant", value: draft.variant },
        { label: "SKU", value: draft.skuCode },
        { label: "Supplier", value: draft.supplierName },
      ],
      onConfirm: () => executeArchiveSku(draft.skuId ?? ""),
    });
  }

  async function executeArchiveSku(skuId: string) {
    setIsPending(true);
    setConfirmError(null);
    const result = await archiveSkuAction(skuId);
    setIsPending(false);
    if (!result.ok) {
      const message = result.error ?? "Delete failed.";
      setConfirmError(message);
      toast.error("Delete failed", { description: message });
      throw new Error(message);
    }
    toast.success("SKU deleted", { description: "The SKU was removed from active inventory." });
    setConfirmation(null);
    setIsOpen(false);
    router.refresh();
  }

  function removePhoto() {
    if (!draft.skuId) return;
    setConfirmError(null);
    setConfirmation({
      title: "Confirm Photo Removal",
      description: "This will clear the SKU photo and record the SKU update.",
      records: [
        { label: "Product", value: draft.productName },
        { label: "SKU", value: draft.skuCode },
        { label: "Photo", value: draft.photoPath ? "Remove current photo" : "No current photo" },
      ],
      onConfirm: executeRemovePhoto,
    });
  }

  async function executeRemovePhoto() {
    if (!draft.skuId) return;
    setIsPhotoPending(true);
    setConfirmError(null);
    const result = await removeSkuPhotoAction(draft.skuId ?? "");
    setIsPhotoPending(false);
    if (!result.ok) {
      const message = result.error ?? "Photo removal failed.";
      setConfirmError(message);
      toast.error("Photo removal failed", { description: message });
      throw new Error(message);
    }
    toast.success("Photo removed", { description: `${draft.productName} photo was cleared.` });
    setConfirmation(null);
    setIsOpen(false);
    router.refresh();
  }

  const categoryDropdownEditorProps = {
    isEditorOpen: isCategoryEditorOpen,
    categoryDraft,
    editingCategoryId,
    isCategoryPending,
    onCategoryDraftChange: setCategoryDraft,
    onSaveCategory: saveCategory,
    onCancelCategory: () => {
      setIsCategoryEditorOpen(false);
      setEditingCategoryId(null);
      setCategoryDraft("");
    },
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-white pb-[calc(6rem+env(safe-area-inset-bottom))] text-black lg:pb-0">
      <div className="min-h-screen lg:pl-[242px]">
        <AppSidebar active="skus" role="admin" restockCount={restockCount} />
        <section className="px-3 py-4 sm:px-8 sm:py-8 lg:px-7 xl:px-8">
          <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-[-0.055em] sm:text-[44px]">SKUs</h1>
              <StoreIdentityEditor initialName={membership.organization_name} initialIcon={membership.organization_icon} workspaceId={membership.organization_id} />
            </div>
            <div className="flex flex-col gap-3 sm:items-end">
              <FluidEntrySurface className="rounded-2xl border border-white/50 bg-lime/80 backdrop-blur-2xl sm:rounded-3xl" contentClassName="flex items-center justify-between gap-5 px-4 py-2.5 sm:block sm:px-6 sm:py-4 sm:text-right">
                <div className="text-xs font-bold uppercase tracking-[0.12em] sm:text-sm">Active SKUs</div>
                <div className="text-2xl font-black tracking-[-0.06em] sm:text-4xl">{rows.length}</div>
              </FluidEntrySurface>
              <Button type="button" data-tutorial="sku-add" onClick={openCreate} className="h-10 rounded-lg bg-black px-5 text-sm font-bold text-white hover:bg-black sm:h-12 sm:px-6 sm:text-base">
                <Plus className="size-5" />
                Add SKU
              </Button>
            </div>
          </header>

          {error ? <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

          <div className="mt-6 grid gap-2 rounded-2xl border border-zinc-200 bg-white p-3 sm:grid-cols-[1fr_220px] sm:p-4">
            <label className="flex h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 focus-within:ring-2 focus-within:ring-lime">
              <Search className="size-4 shrink-0 text-zinc-500" />
              <input data-tutorial="sku-search" value={query} onChange={(event) => setQuery(event.target.value)} className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-zinc-500" placeholder="Search name, variant, category, SKU, supplier" />
            </label>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="h-11 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm font-black outline-none focus:ring-2 focus:ring-lime">
              <option value="all">All categories</option>
              {categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
            </select>
          </div>

          <div className="mt-4 grid gap-3">
            {tableEntries.map((entry) => {
              if (entry.type === "group") {
                const firstRow = entry.rows[0];
                const totalStock = entry.rows.reduce((sum, row) => sum + row.quantity, 0);
                const totalLowStock = entry.rows.reduce((sum, row) => sum + row.low_stock_qty, 0);

                return (
                  <FluidEntrySurface key={entry.id} data-tutorial="sku-group" className="overflow-hidden rounded-lg border border-zinc-200 bg-white" contentClassName="p-0">
                    <div className="xl:hidden">
                      <div className="flex min-w-0 gap-3 border-b border-zinc-100 bg-zinc-50 px-3 py-3">
                        <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-zinc-200 bg-lime text-lg font-black">
                          {firstRow?.photo_url ? <Image src={firstRow.photo_url} alt={entry.productName} width={48} height={48} className="size-full object-cover" /> : entry.productName.slice(0, 1)}
                        </div>
                        <div className="min-w-0">
                          <div className="line-clamp-2 text-sm font-black tracking-[-0.03em]">{entry.productName}</div>
                          <div className="mt-1 text-xs font-bold text-zinc-500">Main SKU</div>
                          <div className="mt-1 text-xs font-semibold text-zinc-400">{entry.variationName} · {entry.rows.length} types</div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <button type="button" data-tutorial="sku-add-type" onClick={() => firstRow && openAppendVariation(firstRow, entry.rows)} className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 text-[11px] font-black text-zinc-700 hover:border-black">
                              <Plus className="size-3" /> Type
                            </button>
                            <button type="button" onClick={() => firstRow && openEdit(firstRow)} className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 text-[11px] font-black text-zinc-700 hover:border-black">
                              <Pencil className="size-3" /> Edit
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="hidden min-w-[860px] grid-cols-[minmax(280px,1.45fr)_minmax(160px,1fr)_90px_120px_150px] gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400 xl:grid">
                      <div>Product / SKU</div>
                      <div>Type</div>
                      <div>Price</div>
                      <div>Stock</div>
                      <div className="text-right">Action</div>
                    </div>

                    <div className="min-w-0 overflow-x-auto">
                      <div className="min-w-0 divide-y divide-zinc-100 xl:min-w-[860px]">
                        <div className="hidden bg-white xl:grid xl:grid-cols-[minmax(280px,1.45fr)_minmax(160px,1fr)_90px_120px_150px] xl:items-center xl:gap-2 xl:px-3 xl:py-2">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md border border-zinc-200 bg-lime text-base font-black">
                              {firstRow?.photo_url ? <Image src={firstRow.photo_url} alt={entry.productName} width={40} height={40} className="size-full object-cover" /> : entry.productName.slice(0, 1)}
                            </div>
                            <div className="min-w-0">
                              <div className="break-words text-sm font-black leading-tight tracking-[-0.035em] text-black">{entry.productName}</div>
                              <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] font-bold text-zinc-500">
                                <span>Main SKU</span>
                                <span>·</span>
                                <span>{entry.variationName}</span>
                                <span>·</span>
                                <span>{entry.rows.length} types</span>
                              </div>
                            </div>
                          </div>
                          <div className="min-w-0 text-xs font-bold leading-tight text-zinc-500">
                            <div className="break-words">{firstRow?.category_name ?? "Grouped types"}</div>
                            <div className="mt-0.5 text-[10px] text-zinc-400">{firstRow?.supplier_name ?? "Main SKU"}</div>
                          </div>
                          <div className="text-sm font-black tabular-nums text-zinc-900">{formatPrice(firstRow?.price ?? 0)}</div>
                          <div className="grid gap-1 text-sm font-black"><StockStat quantity={totalStock} lowStock={totalLowStock} /></div>
                          <div className="flex justify-end gap-1.5">
                            <button type="button" data-tutorial="sku-add-type" onClick={() => firstRow && openAppendVariation(firstRow, entry.rows)} className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-black text-zinc-700 hover:border-black">
                              <Plus className="size-3.5" /> Type
                            </button>
                            <button type="button" onClick={() => firstRow && openEdit(firstRow)} className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-black text-zinc-700 hover:border-black">
                              <Pencil className="size-3.5" /> Edit
                            </button>
                          </div>
                        </div>
                        {entry.rows.map((row) => (
                          <div key={row.sku_id} className="grid min-w-0 gap-2 px-3 py-2 text-sm sm:grid-cols-2 xl:grid-cols-[minmax(280px,1.45fr)_minmax(160px,1fr)_90px_120px_150px] xl:items-center xl:gap-2">
                            <div className="min-w-0 break-words font-bold leading-tight text-zinc-700"><span className="mr-1 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400 xl:hidden">SKU</span>{row.sku_code}</div>
                            <div className="min-w-0 break-words font-semibold leading-tight text-zinc-600"><span className="mr-1 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400 xl:hidden">Type</span>{row.variant ?? "-"}</div>
                            <div className="font-bold tabular-nums"><span className="mr-1 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400 xl:hidden">Price</span>{formatPrice(row.price)}</div>
                            <div className="grid gap-1"><span className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400 xl:hidden">Stock</span><StockStat quantity={row.quantity} lowStock={row.low_stock_qty} /></div>
                            <div className="hidden xl:block" aria-hidden="true" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </FluidEntrySurface>
                );
              }

              const row = entry.row;

              return (
                <FluidEntrySurface key={row.sku_id} className="rounded-xl border border-zinc-200 bg-white" contentClassName="p-2.5">
                  <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(240px,1fr)_90px_110px_minmax(170px,0.8fr)] 2xl:grid-cols-[minmax(260px,1fr)_90px_110px_minmax(180px,0.7fr)_180px] xl:items-center">
                    <div className="flex min-w-0 items-start gap-3">
                    <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-zinc-200 bg-lime text-base font-black">
                      {row.photo_url ? <Image src={row.photo_url} alt={row.product_name} width={44} height={44} className="size-full object-cover" /> : row.product_name.slice(0, 1)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-black tracking-[-0.03em]">{row.product_name}</div>
                      <div className="mt-1 flex flex-wrap gap-1 text-[11px] font-bold text-zinc-500">
                        {row.variant ? <span className="rounded bg-zinc-100 px-1.5 py-0.5">{row.variant}</span> : null}
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5">{row.sku_code}</span>
                      </div>
                    </div>
                  </div>
                    <div className="text-sm font-bold tabular-nums"><span className="mr-1 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400 xl:hidden">Price</span>{formatPrice(row.price)}</div>
                    <div className="grid gap-1 text-sm font-bold"><span className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400 xl:hidden">Stock</span><StockStat quantity={row.quantity} lowStock={row.low_stock_qty} /></div>
                    <div className="min-w-0 text-xs font-bold text-zinc-500"><span className="block truncate text-sm text-zinc-900">{row.supplier_name}</span>{row.contact_name || "No contact"} · {row.country}</div>
                    <div className="flex flex-wrap gap-1.5 xl:col-span-4 2xl:col-span-1">
                    <Button type="button" variant="outline" size="sm" onClick={() => openAppendVariation(row)}>
                      <Plus className="size-3.5" />
                      Type
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => openEdit(row)}>
                      <Pencil className="size-3.5" />
                      Edit
                    </Button>
                    </div>
                  </div>
                </FluidEntrySurface>
              );
            })}
          </div>

          <FluidEntrySurface className="mt-8 hidden rounded-3xl border border-white/50 bg-white/60 backdrop-blur-2xl">
            <div className="overflow-hidden">
              <table className="w-full table-fixed border-collapse text-left">
                <thead>
                  <tr className="h-[52px] bg-black text-white">
                    <th className="w-[25%] px-4 text-sm font-bold xl:px-5 xl:text-base">Product</th>
                    <th className="w-[13%] px-3 text-sm font-bold xl:px-4 xl:text-base">SKU</th>
                    <th className="w-[10%] px-3 text-sm font-bold xl:px-4 xl:text-base">Price</th>
                    <th className="w-[10%] px-3 text-sm font-bold xl:px-4 xl:text-base">Stock</th>
                    <th className="w-[16%] px-3 text-sm font-bold xl:px-4 xl:text-base">Supplier</th>
                    <th className="w-[14%] px-3 text-sm font-bold xl:px-4 xl:text-base">Contact</th>
                    <th className="w-[12%] px-4 text-sm font-bold xl:px-5 xl:text-base">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tableEntries.map((entry) => {
                    if (entry.type === "group") {
                      return (
                        <tr key={entry.id} className="border-t border-border bg-lime/15">
                          <td colSpan={7} className="px-4 py-3 xl:px-5">
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="rounded-full bg-black px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-white">Main SKU</span>
                              <span className="text-sm font-black tracking-[-0.02em]">{entry.productName}</span>
                              <span className="text-sm font-bold text-zinc-500">Main SKU · {entry.variationName} · {entry.rows.length} types</span>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    const row = entry.row;

                    return (
                      <tr key={row.sku_id} className="h-[92px] border-t border-border">
                        <td className="px-4 py-4 xl:px-5">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-lime text-xl font-black xl:size-14">
                              {row.photo_url ? <Image src={row.photo_url} alt={row.product_name} width={56} height={56} className="size-full object-cover" /> : row.product_name.slice(0, 1)}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-bold tracking-[-0.025em] xl:text-base">{row.product_name}</div>
                              <div className="mt-2 flex min-w-0 flex-wrap gap-1 text-xs font-semibold tracking-[-0.03em] xl:text-sm">
                                {row.variation_name ? <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-black text-zinc-500">{row.variation_name}</span> : null}
                                {row.variant ? <span className="truncate">{row.variant}</span> : null}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="truncate px-3 text-sm font-bold xl:px-4 xl:text-base" title={row.sku_code}>{row.sku_code}</td>
                        <td className="px-3 text-sm font-bold xl:px-4 xl:text-base">{formatPrice(row.price)}</td>
                        <td className="px-3 text-sm font-bold xl:px-4 xl:text-base"><div>{row.quantity}</div><div className="text-xs text-zinc-500">Low at {row.low_stock_qty}</div></td>
                        <td className="truncate px-3 text-sm font-bold xl:px-4 xl:text-base" title={row.supplier_name ?? undefined}>{row.supplier_name}</td>
                        <td className="px-3 text-sm font-medium leading-6 xl:px-4 xl:text-base xl:leading-7">
                          <div className="truncate font-bold" title={row.contact_name ?? undefined}>{row.contact_name}</div>
                          <div className="truncate" title={`${row.country ?? ""} · ${row.phone_raw ?? ""}`}>{row.country} · {row.phone_raw}</div>
                        </td>
                        <td className="px-4 xl:px-5">
                          <div className="grid gap-2 xl:flex xl:gap-2">
                            <Button type="button" variant="outline" className="h-9 rounded-md border-border bg-white px-2 text-xs font-bold hover:bg-white xl:h-10 xl:px-3 xl:text-sm" onClick={() => openEdit(row)}>
                              <Pencil className="size-4" />
                              Edit
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </FluidEntrySurface>
        </section>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center overscroll-contain bg-black/45 px-4 py-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]" onClick={() => setIsOpen(false)}>
          <div className="w-full max-w-[23rem] sm:max-w-6xl" onClick={(event) => event.stopPropagation()}>
            <FluidEntrySurface data-tutorial="sku-modal" className="max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] rounded-2xl border border-white/50 bg-white/90 backdrop-blur-2xl sm:rounded-3xl" contentClassName="max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] overflow-y-auto p-4 sm:p-6">
              <form onSubmit={isEditing || createMode === "single" ? handleSubmit : handleVariationSubmit}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-black tracking-[-0.05em] sm:text-2xl">{isEditing ? "Edit SKU" : createMode === "variation" ? (variationDraft.variationGroupId ? "Add Types" : "Add SKU With Types") : "Add SKU"}</h2>
                  <p className="mt-1 text-sm font-semibold text-zinc-500">{createMode === "variation" && !isEditing ? (variationDraft.variationGroupId ? "Add more types under this main SKU." : "Create one main SKU with types like flavor, size, or color.") : "Manage product SKU details and admin-only supplier contact information."}</p>
                </div>
                <button type="button" onClick={() => setIsOpen(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-white text-black" aria-label="Close SKU form">
                  <X className="size-5" />
                </button>
              </div>

              {!isEditing ? (
                <div className="mt-5 inline-flex rounded-xl border border-border bg-zinc-50 p-1">
                  {(["single", "variation"] as const).map((mode) => (
                    <button key={mode} type="button" data-tutorial={`sku-mode-${mode}`} onClick={() => setCreateMode(mode)} className={`h-10 rounded-lg px-4 text-sm font-black capitalize transition ${createMode === mode ? "bg-black text-white" : "text-zinc-500 hover:text-black"}`}>
                      {mode === "single" ? "Single SKU" : "SKU With Types"}
                    </button>
                  ))}
                </div>
              ) : null}

              {isEditing || createMode === "single" ? (
                <div className="mt-6 grid gap-5 2xl:grid-cols-[1.05fr_1.05fr_0.9fr]">
                  <FormSection title="Product">
                    <div className="lg:row-span-3">
                      <PhotoPicker photoUrl={selectedPhotoUrl ?? draft.photoUrl} photoFile={photoFile} onPhotoChange={setPhotoFile} />
                    </div>
                    <Field label="Name"><input data-tutorial="sku-modal-name" required className={inputClassName} value={draft.productName} onChange={(event) => updateDraft("productName", event.target.value)} placeholder="Dog Food - Chicken" /></Field>
                    <Field label="Variant"><input className={inputClassName} value={draft.variant} onChange={(event) => updateDraft("variant", event.target.value)} placeholder="2kg, Medium, 10L" /></Field>
                    <Field label="Category"><CategoryDropdown value={draft.categoryName} categories={categories} onChange={(value) => updateDraft("categoryName", value)} onAdd={startCategoryAdd} onEdit={startCategoryEdit} {...categoryDropdownEditorProps} /></Field>
                    <div className="lg:col-span-2">
                      <Field label="SKU ID"><input required className={inputClassName} value={draft.skuCode} onChange={(event) => updateDraft("skuCode", event.target.value.toUpperCase())} placeholder="DF-CH-2KG" /></Field>
                    </div>
                  </FormSection>

                  <FormSection title="Supplier">
                    <Field label="Company"><input required className={inputClassName} value={draft.supplierName} onChange={(event) => updateDraft("supplierName", event.target.value)} placeholder="PetSupply Co." /></Field>
                    <Field label="Contact"><input className={inputClassName} value={draft.contactName} onChange={(event) => updateDraft("contactName", event.target.value)} placeholder="Maya" /></Field>
                    <Field label="Country"><select className={inputClassName} value={draft.country} onChange={(event) => updateDraft("country", event.target.value === "TH" ? "TH" : "MY")}><option value="MY">Malaysia (+60)</option><option value="TH">Thailand (+66)</option></select></Field>
                    <Field label="WhatsApp / Phone"><input required className={inputClassName} value={draft.phoneRaw} onChange={(event) => updateDraft("phoneRaw", event.target.value)} placeholder="012-345 6789" /></Field>
                  </FormSection>

                  <FormSection title="Stock Rules">
                    <Field label="Price"><input required min={0} step="0.01" type="number" className={inputClassName} value={draft.price} onChange={(event) => updateDraft("price", event.target.value)} /></Field>
                    <Field label="Low at"><input required min={0} type="number" className={inputClassName} value={draft.lowStockQty} onChange={(event) => updateDraft("lowStockQty", event.target.value)} /></Field>
                    <Field label={isEditing ? "Current Stock" : "Starting Stock"}>
                      <input required min={0} type="number" className={inputClassName} value={draft.openingStock} onChange={(event) => updateDraft("openingStock", event.target.value)} />
                      {isEditing ? (
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                          <div className={`h-full rounded-full ${stockProgressColor(Number(draft.openingStock || 0), Number(draft.lowStockQty || 0))}`} style={{ width: `${stockProgress(Number(draft.openingStock || 0), Number(draft.lowStockQty || 0))}%` }} />
                        </div>
                      ) : null}
                    </Field>
                  </FormSection>
                  {isEditing && draft.photoPath ? (
                    <details className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 2xl:col-span-3">
                      <summary className="cursor-pointer text-sm font-black text-zinc-600">Photo options</summary>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <p className="text-sm font-semibold text-zinc-500">Remove the current SKU photo if it is wrong or outdated.</p>
                        <Button type="button" variant="destructive" disabled={isPhotoPending} onClick={removePhoto}>
                          <Trash2 className="size-4" />
                          Remove Photo
                        </Button>
                      </div>
                    </details>
                  ) : null}
                  {isEditing ? (
                    <details className="rounded-xl border border-red-200 bg-red-50 p-3 2xl:col-span-3">
                      <summary className="cursor-pointer text-sm font-black text-red-700">Danger zone</summary>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <p className="text-sm font-semibold text-red-700/80">Delete this SKU so it no longer appears in active inventory views.</p>
                        <Button type="button" variant="destructive" disabled={isPending} onClick={archiveCurrentSku}>
                          <Trash2 className="size-4" />
                          Delete SKU
                        </Button>
                      </div>
                    </details>
                  ) : null}
                </div>
              ) : (
                <div className="mt-6 grid gap-5">
                  <div className="grid gap-5 2xl:grid-cols-2">
                    <FormSection title={variationDraft.variationGroupId ? "Main SKU" : "Main SKU With Types"}>
                      <Field label="Product Name"><input data-tutorial="sku-variation-product" required readOnly={Boolean(variationDraft.variationGroupId)} className={inputClassName} value={variationDraft.productName} onChange={(event) => updateVariationDraft("productName", event.target.value)} placeholder="Cat Food Pouch x28" /></Field>
                      <Field label="Type Group"><input required readOnly={Boolean(variationDraft.variationGroupId)} className={inputClassName} value={variationDraft.variationName} onChange={(event) => updateVariationDraft("variationName", event.target.value)} placeholder="Flavor, Size, Color, Weight" /></Field>
                      <Field label="Category"><CategoryDropdown value={variationDraft.categoryName} categories={categories} onChange={(value) => updateVariationDraft("categoryName", value)} onAdd={startCategoryAdd} onEdit={startCategoryEdit} {...categoryDropdownEditorProps} /></Field>
                      <label className="flex items-center justify-between gap-4 rounded-xl border-2 border-zinc-300 bg-white px-4 py-3 text-sm font-black tracking-[-0.02em] text-zinc-700 lg:col-span-2">
                        Add Type Images
                        <input type="checkbox" checked={variationDraft.addVariationImages} onChange={(event) => updateVariationDraft("addVariationImages", event.target.checked)} className="size-5 accent-lime" />
                      </label>
                    </FormSection>

                    <FormSection title="Supplier">
                      <Field label="Company"><input required className={inputClassName} value={variationDraft.supplierName} onChange={(event) => updateVariationDraft("supplierName", event.target.value)} placeholder="PetSupply Co." /></Field>
                      <Field label="Contact"><input className={inputClassName} value={variationDraft.contactName} onChange={(event) => updateVariationDraft("contactName", event.target.value)} placeholder="Maya" /></Field>
                      <Field label="Country"><select className={inputClassName} value={variationDraft.country} onChange={(event) => updateVariationDraft("country", event.target.value === "TH" ? "TH" : "MY")}><option value="MY">Malaysia (+60)</option><option value="TH">Thailand (+66)</option></select></Field>
                      <Field label="WhatsApp / Phone"><input required className={inputClassName} value={variationDraft.phoneRaw} onChange={(event) => updateVariationDraft("phoneRaw", event.target.value)} placeholder="012-345 6789" /></Field>
                    </FormSection>
                  </div>

                  <section className="rounded-2xl border border-white/50 bg-white/55 p-5 backdrop-blur-lg">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-black uppercase tracking-[0.14em] text-zinc-500">Types</h3>
                        <div className="mt-1 text-xs font-bold text-zinc-500">
                          {variationDraft.items.length} new {variationDraft.items.length === 1 ? "type" : "types"} queued for this bundle
                        </div>
                      </div>
                      <Button type="button" variant="outline" onClick={addVariationItem} className="h-10 rounded-lg border-border bg-white px-4 text-sm font-bold hover:bg-white">
                        <Plus className="size-4" />
                        Add Type
                      </Button>
                    </div>

                    {variationNotice ? <div className="mt-3 rounded-xl border border-lime/60 bg-lime/15 px-3 py-2 text-sm font-black text-zinc-800">{variationNotice}</div> : null}

                    <div className="mt-5 grid gap-4">
                      {variationDraft.items.map((item, index) => (
                        <div key={item.clientId} className="rounded-2xl border border-border bg-white p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-black text-zinc-500">Type {index + 1}</div>
                            <Button type="button" variant="outline" size="icon" onClick={() => removeVariationItem(item.clientId)} disabled={variationDraft.items.length === 1} aria-label="Remove type">
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            <Field label="Type Name"><input data-tutorial="sku-type-name" required className={inputClassName} value={item.name} onChange={(event) => updateVariationItem(item.clientId, "name", event.target.value)} placeholder="Junior Tuna x28" /></Field>
                            <Field label="SKU ID"><input required className={inputClassName} value={item.skuCode} onChange={(event) => updateVariationItem(item.clientId, "skuCode", event.target.value.toUpperCase())} placeholder="FOOD-TUNA-X28" /></Field>
                            <Field label="Price"><input required min={0} step="0.01" type="number" className={inputClassName} value={item.price} onChange={(event) => updateVariationItem(item.clientId, "price", event.target.value)} /></Field>
                            <Field label="Starting Stock"><input required min={0} type="number" className={inputClassName} value={item.openingStock} onChange={(event) => updateVariationItem(item.clientId, "openingStock", event.target.value)} /></Field>
                            <Field label="Low at"><input required min={0} type="number" className={inputClassName} value={item.lowStockQty} onChange={(event) => updateVariationItem(item.clientId, "lowStockQty", event.target.value)} /></Field>
                            {variationDraft.addVariationImages ? (
                              <label className="grid gap-2 text-sm font-black tracking-[-0.02em] text-zinc-700 md:col-span-2 xl:col-span-3">
                                Type Image
                                <div className="flex items-center gap-3 rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-4 py-3">
                                  <ImageIcon className="size-5 shrink-0 text-zinc-500" />
                                  <span className="min-w-0 truncate text-sm font-semibold text-zinc-500">{item.photoFile ? item.photoFile.name : "Choose from gallery"}</span>
                                </div>
                                <input type="file" required accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={(event) => updateVariationItem(item.clientId, "photoFile", event.target.files?.[0] ?? null)} />
                              </label>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}

              <div className="mt-7 flex flex-col-reverse items-start gap-3 sm:flex-row sm:items-center sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button data-tutorial="sku-modal-review" disabled={isPending}>
                  {isPending ? <LumaSpinner label="Saving SKU" /> : isEditing ? <Save className="size-5" /> : <Plus className="size-5" />}
                  {isPending ? "Saving..." : isEditing ? "Review SKU" : createMode === "variation" ? "Review SKU Types" : "Review SKU"}
                </Button>
              </div>
              </form>
            </FluidEntrySurface>
            <p className="mt-3 text-center text-xs font-bold text-white/80">Click anywhere to close</p>
          </div>
        </div>
      ) : null}
      {confirmation ? (
        <ConfirmSlideSheet
          title={confirmation.title}
          description={confirmation.description}
          records={confirmation.records}
          error={confirmError}
          onCancel={() => {
            confirmation.onCancel?.();
            setConfirmation(null);
          }}
          onConfirm={confirmation.onConfirm}
        />
      ) : null}
      {isPending || isPhotoPending ? (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center pt-[calc(0.75rem+env(safe-area-inset-top))]">
          <LumaSpinner className="size-14" label="Saving SKU" />
        </div>
      ) : null}
    </main>
  );
}
