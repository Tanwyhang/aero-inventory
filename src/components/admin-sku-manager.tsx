"use client";

import { FormEvent, startTransition, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ImageIcon, Pencil, Plus, Save, Trash2, X } from "lucide-react";

import { archiveSkuAction, createSkuAction, removeSkuPhotoAction, updateSkuAction, uploadSkuPhotoAction } from "@/app/actions/skus";
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
  lowStockQty: number;
  maxStockQty: number;
  openingStock: number;
  photoUrl: string | null;
  photoPath: string | null;
};

const emptyDraft: Draft = {
  productName: "",
  variant: "",
  skuCode: "",
  supplierName: "",
  contactName: "",
  country: "MY",
  phoneRaw: "",
  lowStockQty: 0,
  maxStockQty: 0,
  openingStock: 0,
  photoUrl: null,
  photoPath: null,
};

const inputClassName = "h-12 w-full min-w-0 rounded-xl border-2 border-zinc-300 bg-white px-4 font-semibold outline-none transition placeholder:text-zinc-400 focus:border-black focus:ring-2 focus:ring-lime";

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

export function AdminSkuManager({ membership, rows }: { membership: Membership; rows: AdminSkuManagerRow[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isPhotoPending, setIsPhotoPending] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isEditing = Boolean(draft.skuId);
  const selectedPhotoUrl = useMemo(() => (photoFile ? URL.createObjectURL(photoFile) : null), [photoFile]);

  useEffect(() => {
    return () => {
      if (selectedPhotoUrl) URL.revokeObjectURL(selectedPhotoUrl);
    };
  }, [selectedPhotoUrl]);

  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function openCreate() {
    setDraft(emptyDraft);
    setPhotoFile(null);
    setError(null);
    setPhotoFile(null);
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
      lowStockQty: row.low_stock_qty,
      maxStockQty: row.max_stock_qty,
      openingStock: row.quantity,
      photoUrl: row.photo_url ?? null,
      photoPath: row.photo_path,
    });
    setError(null);
    setIsOpen(true);
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
      setDraft(emptyDraft);
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
        <AppSidebar active="skus" role="admin" />
        <section className="px-5 py-8 sm:px-8 lg:px-7 xl:px-8">
          <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-4xl font-black tracking-[-0.055em] sm:text-[44px]">SKUs</h1>
              <StoreIdentityEditor initialName={membership.organization_name} initialIcon={membership.organization_icon} />
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
              <table className="w-full min-w-[1180px] border-collapse text-left">
                <thead>
                  <tr className="h-[52px] bg-black text-white">
                    <th className="w-[280px] px-6 text-base font-bold">Product</th>
                    <th className="w-[140px] px-4 text-base font-bold">SKU</th>
                    <th className="w-[140px] px-4 text-base font-bold">Stock</th>
                    <th className="w-[250px] px-4 text-base font-bold">Supplier</th>
                    <th className="w-[240px] px-4 text-base font-bold">Contact</th>
                    <th className="w-[210px] px-6 text-base font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.sku_id} className="h-[92px] border-t border-border">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-lime text-xl font-black">
                            {row.photo_url ? <Image src={row.photo_url} alt={row.product_name} width={56} height={56} className="size-full object-cover" /> : row.product_name.slice(0, 1)}
                          </div>
                          <div>
                            <div className="text-base font-bold tracking-[-0.025em]">{row.product_name}</div>
                            <div className="mt-2 text-sm font-semibold tracking-[-0.03em]">{row.variant}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 text-base font-bold">{row.sku_code}</td>
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
                  ))}
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
              <form onSubmit={handleSubmit}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-2xl font-black tracking-[-0.05em]">{isEditing ? "Edit SKU" : "Add SKU"}</h2>
                  <p className="mt-1 text-sm font-semibold text-zinc-500">Manage product SKU details and admin-only supplier contact information.</p>
                </div>
                <button type="button" onClick={() => setIsOpen(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-white text-black">
                  <X className="size-5" />
                </button>
              </div>

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
                  <Field label="Low Alert"><input required min={0} type="number" className={inputClassName} value={draft.lowStockQty} onChange={(event) => updateDraft("lowStockQty", Number(event.target.value))} /></Field>
                  <Field label="Full Stock"><input required min={0} type="number" className={inputClassName} value={draft.maxStockQty} onChange={(event) => updateDraft("maxStockQty", Number(event.target.value))} /></Field>
                  {!isEditing ? <div className="lg:col-span-2"><Field label="Opening Stock"><input required min={0} type="number" className={inputClassName} value={draft.openingStock} onChange={(event) => updateDraft("openingStock", Number(event.target.value))} /></Field></div> : null}
                </FormSection>
              </div>

              <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)} className="h-12 rounded-lg border-border bg-white px-6 text-base font-semibold text-black hover:bg-white">Cancel</Button>
                <Button disabled={isPending} className="h-12 rounded-lg bg-lime px-6 text-base font-bold text-black hover:bg-lime disabled:opacity-60">
                  {isEditing ? <Save className="size-5" /> : <Plus className="size-5" />}
                  {isPending ? "Saving..." : isEditing ? "Save SKU" : "Add SKU"}
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
