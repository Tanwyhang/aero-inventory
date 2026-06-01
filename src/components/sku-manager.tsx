"use client";

import { FormEvent, useState } from "react";
import { Pencil, Phone, Plus, Save, Trash2, X } from "lucide-react";

import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { StoreIdentityEditor } from "@/components/store-identity-editor";
import { WhatsAppLink, digitsOnly } from "@/components/whatsapp-link";

type SkuItem = {
  id: string;
  product: string;
  detail: string;
  sku: string;
  stock: number;
  maxStock: number;
  supplier: string;
  contactName: string;
  phone: string;
};

type SkuDraft = Omit<SkuItem, "id">;

const initialSkus: SkuItem[] = [
  {
    id: "dog-food-chicken",
    product: "Dog Food - Chicken",
    detail: "2kg",
    sku: "DF-CH-2KG",
    stock: 45,
    maxStock: 60,
    supplier: "PetSupply Co.",
    contactName: "Maya Torres",
    phone: "(555) 123-4567",
  },
  {
    id: "cat-food-tuna",
    product: "Cat Food - Tuna",
    detail: "1.5kg",
    sku: "CF-TU-1.5",
    stock: 12,
    maxStock: 30,
    supplier: "Whisker & Co.",
    contactName: "Leo Grant",
    phone: "(555) 987-6543",
  },
  {
    id: "rubber-ball",
    product: "Rubber Ball",
    detail: "Small",
    sku: "RB-SM-001",
    stock: 0,
    maxStock: 25,
    supplier: "Playful Pets",
    contactName: "Ari Kim",
    phone: "(555) 246-8101",
  },
];

const emptyDraft: SkuDraft = {
  product: "",
  detail: "",
  sku: "",
  stock: 0,
  maxStock: 0,
  supplier: "",
  contactName: "",
  phone: "",
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm font-bold tracking-[-0.02em] text-zinc-600">
      {label}
      {children}
    </label>
  );
}

export default function SkuManager() {
  const [skus, setSkus] = useState(initialSkus);
  const [draft, setDraft] = useState<SkuDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);

  function updateDraft<K extends keyof SkuDraft>(key: K, value: SkuDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setDraft(emptyDraft);
    setEditingId(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (editingId) {
      setSkus((current) =>
        current.map((item) => (item.id === editingId ? { ...draft, id: editingId } : item)),
      );
      resetForm();
      return;
    }

    setSkus((current) => [
      {
        ...draft,
        id: `${draft.sku || draft.product}-${Date.now()}`.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-"),
      },
      ...current,
    ]);
    resetForm();
  }

  function startEditing(item: SkuItem) {
    const { id: _id, ...nextDraft } = item;
    void _id;
    setDraft(nextDraft);
    setEditingId(item.id);
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="min-h-screen lg:pl-[242px]">
        <AppSidebar active="skus" />

        <section className="px-5 py-8 sm:px-8 lg:px-7 xl:px-8">
          <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-4xl font-black tracking-[-0.055em] sm:text-[44px]">SKUs</h1>
              <StoreIdentityEditor />
            </div>
            <div className="flex flex-col gap-3 sm:items-end">
              <div className="rounded-xl border border-white/50 bg-lime/80 px-6 py-4 text-right backdrop-blur-2xl">
                <div className="text-sm font-bold uppercase tracking-[0.12em]">Active SKUs</div>
                <div className="text-4xl font-black tracking-[-0.06em]">{skus.length}</div>
              </div>
              <a
                href="#add-sku-modal"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-black px-6 text-base font-bold text-white hover:bg-black"
              >
                <Plus className="size-5" />
                Add SKU
              </a>
            </div>
          </header>

          <div
            id="add-sku-modal"
            className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 py-8 opacity-0 pointer-events-none transition target:opacity-100 target:pointer-events-auto"
          >
            <form
              onSubmit={handleSubmit}
              className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-white/50 bg-white/85 p-6 backdrop-blur-2xl"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-2xl font-black tracking-[-0.05em]">
                    {editingId ? "Edit SKU" : "Add SKU"}
                  </h2>
                  <p className="mt-1 text-sm font-semibold text-zinc-500">
                    Manage product SKU details and supplier contact information.
                  </p>
                </div>
                <a href="#" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-white text-black">
                  <X className="size-5" />
                </a>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Product">
                  <input required className="h-12 rounded-lg border border-border px-4 font-semibold outline-none focus:ring-2 focus:ring-lime" value={draft.product} onChange={(event) => updateDraft("product", event.target.value)} placeholder="Dog Food - Chicken" />
                </Field>
                <Field label="Variant / Size">
                  <input required className="h-12 rounded-lg border border-border px-4 font-semibold outline-none focus:ring-2 focus:ring-lime" value={draft.detail} onChange={(event) => updateDraft("detail", event.target.value)} placeholder="2kg" />
                </Field>
                <Field label="SKU">
                  <input required className="h-12 rounded-lg border border-border px-4 font-semibold uppercase outline-none focus:ring-2 focus:ring-lime" value={draft.sku} onChange={(event) => updateDraft("sku", event.target.value.toUpperCase())} placeholder="DF-CH-2KG" />
                </Field>
                <Field label="Supplier">
                  <input required className="h-12 rounded-lg border border-border px-4 font-semibold outline-none focus:ring-2 focus:ring-lime" value={draft.supplier} onChange={(event) => updateDraft("supplier", event.target.value)} placeholder="PetSupply Co." />
                </Field>
                <Field label="Current Stock">
                  <input required min={0} type="number" className="h-12 rounded-lg border border-border px-4 font-semibold outline-none focus:ring-2 focus:ring-lime" value={draft.stock} onChange={(event) => updateDraft("stock", Number(event.target.value))} />
                </Field>
                <Field label="Max Stock">
                  <input required min={0} type="number" className="h-12 rounded-lg border border-border px-4 font-semibold outline-none focus:ring-2 focus:ring-lime" value={draft.maxStock} onChange={(event) => updateDraft("maxStock", Number(event.target.value))} />
                </Field>
                <Field label="Supplier Contact">
                  <input required className="h-12 rounded-lg border border-border px-4 font-semibold outline-none focus:ring-2 focus:ring-lime" value={draft.contactName} onChange={(event) => updateDraft("contactName", event.target.value)} placeholder="Maya Torres" />
                </Field>
                <Field label="Phone">
                  <input required className="h-12 rounded-lg border border-border px-4 font-semibold outline-none focus:ring-2 focus:ring-lime" value={draft.phone} onChange={(event) => updateDraft("phone", event.target.value)} placeholder="(555) 123-4567" />
                </Field>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <a href="#" className="inline-flex h-12 items-center justify-center rounded-lg border border-border bg-white px-6 text-base font-semibold text-black">Cancel</a>
                <Button className="h-12 rounded-lg bg-lime px-6 text-base font-bold text-black hover:bg-lime">
                  {editingId ? <Save className="size-5" /> : <Plus className="size-5" />}
                  {editingId ? "Save SKU" : "Add SKU"}
                </Button>
              </div>
            </form>
          </div>

          <div className="mt-8 overflow-hidden rounded-xl border border-white/50 bg-white/60 backdrop-blur-2xl">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] border-collapse text-left">
                <thead>
                  <tr className="h-[52px] bg-black text-white">
                    <th className="w-[250px] px-6 text-base font-bold">Product</th>
                    <th className="w-[150px] px-4 text-base font-bold">SKU</th>
                    <th className="w-[120px] px-4 text-base font-bold">Stock</th>
                    <th className="w-[280px] px-4 text-base font-bold">Supplier Contact</th>
                    <th className="w-[260px] px-4 text-base font-bold">Supplier</th>
                    <th className="w-[180px] px-6 text-base font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {skus.map((item) => (
                    <tr key={item.id} className="h-[92px] border-t border-border">
                      <td className="px-6 py-4">
                        <div className="text-base font-bold tracking-[-0.025em]">{item.product}</div>
                        <div className="mt-2 text-sm font-semibold tracking-[-0.03em]">{item.detail}</div>
                      </td>
                      <td className="px-4 text-base font-bold">{item.sku}</td>
                      <td className="px-4 text-base font-bold">{item.stock} / {item.maxStock}</td>
                      <td className="px-4 text-base font-medium leading-7">
                        <div className="font-bold">{item.contactName}</div>
                        <WhatsAppLink phone={item.phone} product={item.product} supplier={item.supplier} className="h-9 rounded-md bg-[#25D366] px-4 text-sm font-bold text-white hover:bg-[#25D366]" />
                        <a className="flex items-center gap-2" href={`tel:${digitsOnly(item.phone)}`}>
                          <Phone className="size-4" />
                          {item.phone}
                        </a>
                      </td>
                      <td className="px-4 text-base font-bold">{item.supplier}</td>
                      <td className="px-6">
                        <div className="flex gap-3">
                          <Button type="button" variant="outline" className="h-10 rounded-md border-border bg-white px-4 text-sm font-bold hover:bg-white" onClick={() => startEditing(item)}>
                            <Pencil className="size-4" />
                            Edit
                          </Button>
                          <Button type="button" className="h-10 rounded-md bg-red-500 px-4 text-sm font-bold text-white hover:bg-red-500" onClick={() => setSkus((current) => current.filter((sku) => sku.id !== item.id))}>
                            <Trash2 className="size-4" />
                            Remove
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
