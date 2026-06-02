"use client";

import { FormEvent, startTransition, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ImageIcon, Pencil, Plus, Save, Trash2, X } from "lucide-react";

import { archiveSkuAction, createSkuAction, createVariationGroupAction, removeSkuPhotoAction, updateSkuAction, uploadSkuPhotoAction } from "@/app/actions/skus";
import { AppSidebar } from "@/components/app-sidebar";
import { FluidEntrySurface } from "@/components/fluid-entry-surface";
import { StoreIdentityEditor } from "@/components/store-identity-editor";
import { Button } from "@/components/ui/button";
import type { AdminSkuManagerRow, Membership } from "@/types/database";

type Draft = {
  skuId?: string;
  productName: string;
  variant: string;
  skuCode: string;
  supplierName: string;
  contactName: string;
  country: "MY" | "TH";
  phoneRaw: string;
  price: number;
  lowStockQty: number;
  maxStockQty: number;
  openingStock: number;
  photoUrl: string | null;
  photoPath: string | null;
  demoPhotoPath?: string;
};

type CreateMode = "single" | "variation";

type VariationItemDraft = {
  clientId: string;
  name: string;
  skuCode: string;
  price: number;
  lowStockQty: number;
  maxStockQty: number;
  openingStock: number;
  photoFile: File | null;
};

type VariationDraft = {
  productName: string;
  variationName: string;
  addVariationImages: boolean;
  supplierName: string;
  contactName: string;
  country: "MY" | "TH";
  phoneRaw: string;
  items: VariationItemDraft[];
};

const demoDraft: Draft = {
  productName: "Demo Pet Shampoo",
  variant: "500ml",
  skuCode: "DEMO-SHAMPOO-500ML",
  supplierName: "Demo Pet Supply",
  contactName: "Maya",
  country: "MY",
  phoneRaw: "012-345 6789",
  price: 0,
  lowStockQty: 8,
  maxStockQty: 60,
  openingStock: 24,
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
    price: 0,
    lowStockQty: 8,
    maxStockQty: 60,
    openingStock: 0,
    photoFile: null,
  };
}

function newVariationDraft(): VariationDraft {
  return {
    productName: "Demo Cat Food",
    variationName: "Flavor",
    addVariationImages: true,
    supplierName: "Demo Pet Supply",
    contactName: "Maya",
    country: "MY",
    phoneRaw: "012-345 6789",
    items: [newVariationItem(1)],
  };
}

function formatPrice(price: number | null | undefined) {
  return `RM ${Number(price ?? 0).toFixed(2)}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid min-w-0 gap-2 text-sm font-black tracking-[-0.02em] text-zinc-700">{label}{children}</label>;
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
      <span className="text-xs font-semibold text-zinc-500">{photoFile ? photoFile.name : "Camera or gallery"}</span>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        capture="environment"
        className="sr-only"
        onChange={(event) => onPhotoChange(event.target.files?.[0] ?? null)}
      />
    </label>
  );
}

export function AdminSkuManager({ membership, rows, restockCount = 0 }: { membership: Membership; rows: AdminSkuManagerRow[]; restockCount?: number }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(demoDraft);
  const [createMode, setCreateMode] = useState<CreateMode>("single");
  const [variationDraft, setVariationDraft] = useState<VariationDraft>(() => newVariationDraft());
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isPhotoPending, setIsPhotoPending] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isEditing = Boolean(draft.skuId);
  const selectedPhotoUrl = useMemo(() => (photoFile ? URL.createObjectURL(photoFile) : null), [photoFile]);
  const tableEntries = useMemo(() => {
    const entries: Array<
      | { type: "group"; id: string; productName: string; variationName: string; count: number }
      | { type: "sku"; row: AdminSkuManagerRow }
    > = [];
    const grouped = new Map<string, AdminSkuManagerRow[]>();
    const singles: AdminSkuManagerRow[] = [];

    for (const row of rows) {
      if (!row.variation_group_id) {
        singles.push(row);
        continue;
      }

      const groupRows = grouped.get(row.variation_group_id) ?? [];
      groupRows.push(row);
      grouped.set(row.variation_group_id, groupRows);
    }

    for (const row of singles) entries.push({ type: "sku", row });

    for (const [id, groupRows] of grouped) {
      const first = groupRows[0];
      entries.push({ type: "group", id, productName: first.product_name, variationName: first.variation_name ?? "Variation", count: groupRows.length });
      for (const row of groupRows) entries.push({ type: "sku", row });
    }

    return entries;
  }, [rows]);

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

  function addVariationItem() {
    setVariationDraft((current) => ({
      ...current,
      items: [...current.items, newVariationItem(current.items.length + 1)],
    }));
  }

  function removeVariationItem(clientId: string) {
    setVariationDraft((current) => ({
      ...current,
      items: current.items.length > 1 ? current.items.filter((item) => item.clientId !== clientId) : current.items,
    }));
  }

  function openCreate() {
    const demoPhotoRow = rows.find((row) => row.photo_url && row.photo_path);

    setDraft({
      ...demoDraft,
      skuCode: `DEMO-${Date.now().toString().slice(-5)}`,
      photoUrl: demoPhotoRow?.photo_url ?? null,
      photoPath: demoPhotoRow?.photo_path ?? null,
      demoPhotoPath: demoPhotoRow?.photo_path ?? undefined,
    });
    setCreateMode("single");
    setVariationDraft(newVariationDraft());
    setPhotoFile(null);
    setError(null);
    setIsOpen(true);
  }

  function openEdit(row: AdminSkuManagerRow) {
    setDraft({
      skuId: row.sku_id,
      productName: row.product_name,
      variant: row.variant ?? "",
      skuCode: row.sku_code,
      supplierName: row.supplier_name ?? "",
      contactName: row.contact_name ?? "",
      country: row.country === "TH" ? "TH" : "MY",
      phoneRaw: row.phone_raw ?? "",
      price: row.price ?? 0,
      lowStockQty: row.low_stock_qty,
      maxStockQty: row.max_stock_qty,
      openingStock: row.quantity,
      photoUrl: row.photo_url ?? null,
      photoPath: row.photo_path,
      demoPhotoPath: undefined,
    });
    setCreateMode("single");
    setError(null);
    setIsOpen(true);
  }

  function handleVariationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setError(null);

    if (variationDraft.addVariationImages && variationDraft.items.some((item) => !item.photoFile)) {
      setIsPending(false);
      setError("Add a photo for every variation item, or turn off variation images.");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("payload", JSON.stringify({
        productName: variationDraft.productName,
        variationName: variationDraft.variationName,
        addVariationImages: variationDraft.addVariationImages,
        supplierName: variationDraft.supplierName,
        contactName: variationDraft.contactName,
        country: variationDraft.country,
        phoneRaw: variationDraft.phoneRaw,
        items: variationDraft.items.map((item) => ({
          clientId: item.clientId,
          name: item.name,
          skuCode: item.skuCode,
          price: item.price,
          lowStockQty: item.lowStockQty,
          maxStockQty: item.maxStockQty,
          openingStock: item.openingStock,
        })),
      }));

      if (variationDraft.addVariationImages) {
        for (const item of variationDraft.items) {
          if (item.photoFile) formData.set(`photo:${item.clientId}`, item.photoFile);
        }
      }

      const result = await createVariationGroupAction(formData);
      setIsPending(false);

      if (result.ok !== true) {
        setError(result.error ?? "Variation group save failed.");
        return;
      }

      setIsOpen(false);
      setCreateMode("single");
      setVariationDraft(newVariationDraft());
      router.refresh();
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setError(null);

    startTransition(async () => {
      const result = isEditing ? await updateSkuAction(draft) : await createSkuAction(draft);

      if (result.ok !== true) {
        setIsPending(false);
        setError(result.error ?? "SKU save failed.");
        return;
      }

      const createdSkuId = "skuId" in result && typeof result.skuId === "string" ? result.skuId : undefined;
      const skuId = draft.skuId ?? createdSkuId;

      if (photoFile && skuId) {
        const formData = new FormData();
        formData.set("skuId", skuId);
        formData.set("photo", photoFile);
        const photoResult = await uploadSkuPhotoAction(formData);

        if (!photoResult.ok) {
          setIsPending(false);
          setError(photoResult.error ?? "SKU saved, but photo upload failed.");
          return;
        }
      }

      setIsPending(false);

      setIsOpen(false);
      setDraft({ ...demoDraft });
      setPhotoFile(null);
      router.refresh();
    });
  }

  function archiveSku(skuId: string) {
    setIsPending(true);
    startTransition(async () => {
      const result = await archiveSkuAction(skuId);
      setIsPending(false);
      if (!result.ok) setError(result.error ?? "Archive failed.");
      else router.refresh();
    });
  }

  function removePhoto() {
    if (!draft.skuId) return;
    setIsPhotoPending(true);
    setError(null);
    startTransition(async () => {
      const result = await removeSkuPhotoAction(draft.skuId ?? "");
      setIsPhotoPending(false);
      if (!result.ok) {
        setError(result.error ?? "Photo removal failed.");
        return;
      }
      setIsOpen(false);
      router.refresh();
    });
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="min-h-screen lg:pl-[242px]">
        <AppSidebar active="skus" role="admin" restockCount={restockCount} />
        <section className="px-5 py-8 sm:px-8 lg:px-7 xl:px-8">
          <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-4xl font-black tracking-[-0.055em] sm:text-[44px]">SKUs</h1>
              <StoreIdentityEditor initialName={membership.organization_name} initialIcon={membership.organization_icon} workspaceId={membership.organization_id} />
            </div>
            <div className="flex flex-col gap-3 sm:items-end">
              <FluidEntrySurface className="rounded-3xl border border-white/50 bg-lime/80 backdrop-blur-2xl" contentClassName="px-6 py-4 text-right">
                <div className="text-sm font-bold uppercase tracking-[0.12em]">Active SKUs</div>
                <div className="text-4xl font-black tracking-[-0.06em]">{rows.length}</div>
              </FluidEntrySurface>
              <Button type="button" onClick={openCreate} className="h-12 rounded-lg bg-black px-6 text-base font-bold text-white hover:bg-black">
                <Plus className="size-5" />
                Add SKU
              </Button>
            </div>
          </header>

          {error ? <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

          <FluidEntrySurface className="mt-8 rounded-3xl border border-white/50 bg-white/60 backdrop-blur-2xl">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1300px] border-collapse text-left">
                <thead>
                  <tr className="h-[52px] bg-black text-white">
                    <th className="w-[280px] px-6 text-base font-bold">Product</th>
                    <th className="w-[140px] px-4 text-base font-bold">SKU</th>
                    <th className="w-[120px] px-4 text-base font-bold">Price</th>
                    <th className="w-[140px] px-4 text-base font-bold">Stock</th>
                    <th className="w-[250px] px-4 text-base font-bold">Supplier</th>
                    <th className="w-[240px] px-4 text-base font-bold">Contact</th>
                    <th className="w-[210px] px-6 text-base font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tableEntries.map((entry) => {
                    if (entry.type === "group") {
                      return (
                        <tr key={entry.id} className="border-t border-border bg-lime/15">
                          <td colSpan={7} className="px-6 py-3">
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="rounded-full bg-black px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-white">Variation Bundle</span>
                              <span className="text-sm font-black tracking-[-0.02em]">{entry.productName}</span>
                              <span className="text-sm font-bold text-zinc-500">{entry.variationName} · {entry.count} SKUs</span>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    const row = entry.row;

                    return (
                      <tr key={row.sku_id} className="h-[92px] border-t border-border">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-lime text-xl font-black">
                              {row.photo_url ? <Image src={row.photo_url} alt={row.product_name} width={56} height={56} className="size-full object-cover" /> : row.product_name.slice(0, 1)}
                            </div>
                            <div>
                              <div className="text-base font-bold tracking-[-0.025em]">{row.product_name}</div>
                              <div className="mt-2 flex flex-wrap gap-1 text-sm font-semibold tracking-[-0.03em]">
                                {row.variation_name ? <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-black text-zinc-500">{row.variation_name}</span> : null}
                                {row.variant ? <span>{row.variant}</span> : null}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 text-base font-bold">{row.sku_code}</td>
                        <td className="px-4 text-base font-bold">{formatPrice(row.price)}</td>
                        <td className="px-4 text-base font-bold">{row.quantity} / {row.max_stock_qty}</td>
                        <td className="px-4 text-base font-bold">{row.supplier_name}</td>
                        <td className="px-4 text-base font-medium leading-7">
                          <div className="font-bold">{row.contact_name}</div>
                          <div>{row.country} · {row.phone_raw}</div>
                        </td>
                        <td className="px-6">
                          <div className="flex gap-3">
                            <Button type="button" variant="outline" className="h-10 rounded-md border-border bg-white px-4 text-sm font-bold hover:bg-white" onClick={() => openEdit(row)}>
                              <Pencil className="size-4" />
                              Edit
                            </Button>
                            <Button type="button" disabled={isPending} className="h-10 rounded-md bg-red-500 px-4 text-sm font-bold text-white hover:bg-red-500" onClick={() => archiveSku(row.sku_id)}>
                              <Trash2 className="size-4" />
                              Archive
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
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 py-8" onClick={() => setIsOpen(false)}>
          <div className="w-full max-w-6xl" onClick={(event) => event.stopPropagation()}>
            <FluidEntrySurface className="max-h-[90vh] max-w-6xl rounded-3xl border border-white/50 bg-white/85 backdrop-blur-2xl" contentClassName="max-h-[90vh] overflow-y-auto p-5 sm:p-6">
              <form onSubmit={isEditing || createMode === "single" ? handleSubmit : handleVariationSubmit}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-2xl font-black tracking-[-0.05em]">{isEditing ? "Edit SKU" : createMode === "variation" ? "Add Variation Bundle" : "Add SKU"}</h2>
                  <p className="mt-1 text-sm font-semibold text-zinc-500">{createMode === "variation" && !isEditing ? "Create grouped variation items as real inventory SKUs." : "Manage product SKU details and admin-only supplier contact information."}</p>
                </div>
                <button type="button" onClick={() => setIsOpen(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-white text-black">
                  <X className="size-5" />
                </button>
              </div>

              {!isEditing ? (
                <div className="mt-5 inline-flex rounded-xl border border-border bg-zinc-50 p-1">
                  {(["single", "variation"] as const).map((mode) => (
                    <button key={mode} type="button" onClick={() => setCreateMode(mode)} className={`h-10 rounded-lg px-4 text-sm font-black capitalize transition ${createMode === mode ? "bg-black text-white" : "text-zinc-500 hover:text-black"}`}>
                      {mode === "single" ? "Single SKU" : "Variation Bundle"}
                    </button>
                  ))}
                </div>
              ) : null}

              {isEditing || createMode === "single" ? (
                <div className="mt-6 grid gap-5 2xl:grid-cols-[1.05fr_1.05fr_0.9fr]">
                  <FormSection title="Product">
                    <div className="lg:row-span-3">
                      <PhotoPicker photoUrl={selectedPhotoUrl ?? draft.photoUrl} photoFile={photoFile} onPhotoChange={setPhotoFile} />
                      {isEditing && draft.photoPath ? (
                        <Button type="button" variant="outline" disabled={isPhotoPending} onClick={removePhoto} className="mt-3 h-10 rounded-lg border-border bg-white px-4 text-sm font-bold hover:bg-white">
                          Remove Photo
                        </Button>
                      ) : null}
                    </div>
                    <Field label="Name"><input required className={inputClassName} value={draft.productName} onChange={(event) => updateDraft("productName", event.target.value)} placeholder="Dog Food - Chicken" /></Field>
                    <Field label="Variant"><input className={inputClassName} value={draft.variant} onChange={(event) => updateDraft("variant", event.target.value)} placeholder="2kg, Medium, 10L" /></Field>
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
                    <Field label="Price"><input required min={0} step="0.01" type="number" className={inputClassName} value={draft.price} onChange={(event) => updateDraft("price", Number(event.target.value))} /></Field>
                    <Field label="Low Alert"><input required min={0} type="number" className={inputClassName} value={draft.lowStockQty} onChange={(event) => updateDraft("lowStockQty", Number(event.target.value))} /></Field>
                    <Field label="Full Stock"><input required min={0} type="number" className={inputClassName} value={draft.maxStockQty} onChange={(event) => updateDraft("maxStockQty", Number(event.target.value))} /></Field>
                    {!isEditing ? <Field label="Opening Stock"><input required min={0} type="number" className={inputClassName} value={draft.openingStock} onChange={(event) => updateDraft("openingStock", Number(event.target.value))} /></Field> : null}
                  </FormSection>
                </div>
              ) : (
                <div className="mt-6 grid gap-5">
                  <div className="grid gap-5 2xl:grid-cols-2">
                    <FormSection title="Variation Bundle">
                      <Field label="Product Name"><input required className={inputClassName} value={variationDraft.productName} onChange={(event) => updateVariationDraft("productName", event.target.value)} placeholder="Cat Food Pouch x28" /></Field>
                      <Field label="Variation Name"><input required className={inputClassName} value={variationDraft.variationName} onChange={(event) => updateVariationDraft("variationName", event.target.value)} placeholder="Flavor, Size, Color, Weight" /></Field>
                      <label className="flex items-center justify-between gap-4 rounded-xl border-2 border-zinc-300 bg-white px-4 py-3 text-sm font-black tracking-[-0.02em] text-zinc-700 lg:col-span-2">
                        Add Variation Images
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
                      <h3 className="text-sm font-black uppercase tracking-[0.14em] text-zinc-500">Variation Items</h3>
                      <Button type="button" variant="outline" onClick={addVariationItem} className="h-10 rounded-lg border-border bg-white px-4 text-sm font-bold hover:bg-white">
                        <Plus className="size-4" />
                        Add Item
                      </Button>
                    </div>

                    <div className="mt-5 grid gap-4">
                      {variationDraft.items.map((item, index) => (
                        <div key={item.clientId} className="rounded-2xl border border-border bg-white p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-black text-zinc-500">Item {index + 1}</div>
                            <button type="button" onClick={() => removeVariationItem(item.clientId)} disabled={variationDraft.items.length === 1} className="grid size-9 place-items-center rounded-lg border border-border text-zinc-500 disabled:opacity-40" aria-label="Remove variation item">
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            <Field label="Item Name"><input required className={inputClassName} value={item.name} onChange={(event) => updateVariationItem(item.clientId, "name", event.target.value)} placeholder="Junior Tuna x28" /></Field>
                            <Field label="SKU ID"><input required className={inputClassName} value={item.skuCode} onChange={(event) => updateVariationItem(item.clientId, "skuCode", event.target.value.toUpperCase())} placeholder="FOOD-TUNA-X28" /></Field>
                            <Field label="Price"><input required min={0} step="0.01" type="number" className={inputClassName} value={item.price} onChange={(event) => updateVariationItem(item.clientId, "price", Number(event.target.value))} /></Field>
                            <Field label="Opening Stock"><input required min={0} type="number" className={inputClassName} value={item.openingStock} onChange={(event) => updateVariationItem(item.clientId, "openingStock", Number(event.target.value))} /></Field>
                            <Field label="Low Alert"><input required min={0} type="number" className={inputClassName} value={item.lowStockQty} onChange={(event) => updateVariationItem(item.clientId, "lowStockQty", Number(event.target.value))} /></Field>
                            <Field label="Full Stock"><input required min={0} type="number" className={inputClassName} value={item.maxStockQty} onChange={(event) => updateVariationItem(item.clientId, "maxStockQty", Number(event.target.value))} /></Field>
                            {variationDraft.addVariationImages ? (
                              <label className="grid gap-2 text-sm font-black tracking-[-0.02em] text-zinc-700 md:col-span-2 xl:col-span-3">
                                Variation Image
                                <div className="flex items-center gap-3 rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-4 py-3">
                                  <ImageIcon className="size-5 shrink-0 text-zinc-500" />
                                  <span className="min-w-0 truncate text-sm font-semibold text-zinc-500">{item.photoFile ? item.photoFile.name : "Camera or gallery"}</span>
                                </div>
                                <input type="file" required accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" className="sr-only" onChange={(event) => updateVariationItem(item.clientId, "photoFile", event.target.files?.[0] ?? null)} />
                              </label>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}

              <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)} className="h-12 rounded-lg border-border bg-white px-6 text-base font-semibold text-black hover:bg-white">Cancel</Button>
                <Button disabled={isPending} className="h-12 rounded-lg bg-lime px-6 text-base font-bold text-black hover:bg-lime disabled:opacity-60">
                  {isEditing ? <Save className="size-5" /> : <Plus className="size-5" />}
                  {isPending ? "Saving..." : isEditing ? "Save SKU" : createMode === "variation" ? "Create Variation SKUs" : "Add SKU"}
                </Button>
              </div>
              </form>
            </FluidEntrySurface>
            <p className="mt-3 text-center text-xs font-bold text-white/80">Click anywhere to close</p>
          </div>
        </div>
      ) : null}
    </main>
  );
}
