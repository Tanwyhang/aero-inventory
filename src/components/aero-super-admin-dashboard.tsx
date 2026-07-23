"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useDeferredValue, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowLeft, Boxes, Building2, Search, ShieldCheck, Store, Users } from "lucide-react";

import aeroLogo from "../../design/logoword.webp";
import { updateAeroCustomerAction, type AeroAdminActionState } from "@/app/actions/aero-admin";
import { useLocale } from "@/components/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import type { AeroCustomerStatus, AeroSuperAdminCustomer } from "@/types/aero-admin";

const initialActionState: AeroAdminActionState = { status: "idle", message: "" };

const copy = {
  en: {
    eyebrow: "Aero internal",
    title: "Customer control",
    description: "Review customer usage, login seats, and workspace access from one protected page.",
    signedIn: "Signed in as",
    back: "Back to Aero",
    customers: "Customers",
    activeCustomers: "Active customers",
    members: "Members",
    skus: "SKUs",
    search: "Search customer, slug, admin, or workspace ID",
    allStatuses: "All statuses",
    active: "Active",
    suspended: "Suspended",
    archived: "Archived",
    noCustomers: "No customers yet",
    noCustomersDescription: "Customer workspaces will appear here after they are created.",
    noMatches: "No matching customers",
    noMatchesDescription: "Change the search text or status filter.",
    clear: "Clear filters",
    primaryAdmin: "Primary admin",
    plan: "Plan",
    lastLogin: "Last login",
    never: "Never",
    created: "Created",
    workspaceId: "Workspace ID",
    adminSeats: "Admin login limit",
    staffSeats: "Staff login limit",
    used: "reserved",
    activeSeat: "active",
    invitedSeat: "invited",
    viewers: "Viewers",
    warehouses: "Warehouses",
    usage: "Customer usage",
    accessAndLimits: "Access and login limits",
    workspaceStatus: "Workspace status",
    save: "Save settings",
    saving: "Saving…",
    archivedReadOnly: "Archived workspaces are read-only.",
    settingsSaved: "Customer settings saved.",
    invalidLimits: "Enter valid login limits before saving.",
    sessionExpired: "Your session expired. Sign in again.",
    permissionDenied: "You do not have permission to manage customers.",
    limitBelowUsage: "Login limits cannot be lower than active, invited, or reserved seats.",
  },
  zh: {
    eyebrow: "Aero 内部系统",
    title: "顾客管理",
    description: "在受保护的页面查看顾客用量、登录名额及工作区状态。",
    signedIn: "登录账户",
    back: "返回 Aero",
    customers: "顾客",
    activeCustomers: "启用顾客",
    members: "成员",
    skus: "SKU",
    search: "搜索顾客、Slug、管理员或工作区 ID",
    allStatuses: "所有状态",
    active: "启用",
    suspended: "暂停",
    archived: "已归档",
    noCustomers: "还没有顾客",
    noCustomersDescription: "顾客建立工作区后会显示在这里。",
    noMatches: "没有符合条件的顾客",
    noMatchesDescription: "请更改搜索内容或状态筛选。",
    clear: "清除筛选",
    primaryAdmin: "主要管理员",
    plan: "配套",
    lastLogin: "最后登录",
    never: "从未登录",
    created: "建立日期",
    workspaceId: "工作区 ID",
    adminSeats: "管理员登录上限",
    staffSeats: "员工登录上限",
    used: "已占用",
    activeSeat: "启用",
    invitedSeat: "已邀请",
    viewers: "查看者",
    warehouses: "仓库",
    usage: "顾客用量",
    accessAndLimits: "访问状态及登录上限",
    workspaceStatus: "工作区状态",
    save: "保存设置",
    saving: "保存中…",
    archivedReadOnly: "已归档的工作区为只读。",
    settingsSaved: "顾客设置已保存。",
    invalidLimits: "请先输入有效的登录上限。",
    sessionExpired: "登录已过期，请重新登录。",
    permissionDenied: "你没有管理顾客的权限。",
    limitBelowUsage: "登录上限不能低于已启用、已邀请或已预留的名额。",
  },
  th: {
    eyebrow: "ระบบภายใน Aero",
    title: "จัดการลูกค้า",
    description: "ตรวจสอบการใช้งาน จำนวนบัญชี และสถานะพื้นที่ทำงานในหน้าที่มีการป้องกัน",
    signedIn: "เข้าสู่ระบบด้วย",
    back: "กลับไปที่ Aero",
    customers: "ลูกค้า",
    activeCustomers: "ลูกค้าที่ใช้งาน",
    members: "สมาชิก",
    skus: "SKU",
    search: "ค้นหาลูกค้า slug ผู้ดูแล หรือรหัสพื้นที่ทำงาน",
    allStatuses: "ทุกสถานะ",
    active: "ใช้งาน",
    suspended: "ระงับ",
    archived: "เก็บถาวร",
    noCustomers: "ยังไม่มีลูกค้า",
    noCustomersDescription: "พื้นที่ทำงานของลูกค้าจะแสดงที่นี่หลังจากสร้างแล้ว",
    noMatches: "ไม่พบลูกค้าที่ตรงกัน",
    noMatchesDescription: "เปลี่ยนคำค้นหาหรือตัวกรองสถานะ",
    clear: "ล้างตัวกรอง",
    primaryAdmin: "ผู้ดูแลหลัก",
    plan: "แพ็กเกจ",
    lastLogin: "เข้าสู่ระบบล่าสุด",
    never: "ยังไม่เคย",
    created: "สร้างเมื่อ",
    workspaceId: "รหัสพื้นที่ทำงาน",
    adminSeats: "ขีดจำกัดบัญชีผู้ดูแล",
    staffSeats: "ขีดจำกัดบัญชีพนักงาน",
    used: "จองแล้ว",
    activeSeat: "ใช้งาน",
    invitedSeat: "เชิญแล้ว",
    viewers: "ผู้ดูอย่างเดียว",
    warehouses: "คลังสินค้า",
    usage: "การใช้งานของลูกค้า",
    accessAndLimits: "สถานะและขีดจำกัดบัญชี",
    workspaceStatus: "สถานะพื้นที่ทำงาน",
    save: "บันทึกการตั้งค่า",
    saving: "กำลังบันทึก…",
    archivedReadOnly: "พื้นที่ทำงานที่เก็บถาวรเป็นแบบอ่านอย่างเดียว",
    settingsSaved: "บันทึกการตั้งค่าลูกค้าแล้ว",
    invalidLimits: "กรอกขีดจำกัดบัญชีที่ถูกต้องก่อนบันทึก",
    sessionExpired: "เซสชันหมดอายุ โปรดเข้าสู่ระบบอีกครั้ง",
    permissionDenied: "คุณไม่มีสิทธิ์จัดการลูกค้า",
    limitBelowUsage: "ขีดจำกัดบัญชีต้องไม่น้อยกว่าจำนวนที่ใช้งาน เชิญ หรือจองไว้",
  },
} as const;

type DashboardCopy = (typeof copy)[keyof typeof copy];

const dateFormatters = {
  en: new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeStyle: "short" }),
  zh: new Intl.DateTimeFormat("zh-MY", { dateStyle: "medium", timeStyle: "short" }),
  th: new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }),
};

function formatDate(value: string | null, locale: keyof typeof dateFormatters, fallback: string) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : dateFormatters[locale].format(date);
}

function translatedActionMessage(message: string, text: DashboardCopy) {
  if (message === "Customer settings saved.") return text.settingsSaved;
  if (message === "Enter valid login limits before saving.") return text.invalidLimits;
  if (message === "Your session expired. Sign in again.") return text.sessionExpired;
  if (message === "You do not have permission to manage customers.") return text.permissionDenied;
  if (message === "Login limits cannot be lower than active, invited, or reserved seats.") return text.limitBelowUsage;
  return message;
}

function statusLabel(status: AeroCustomerStatus, text: DashboardCopy) {
  if (status === "active") return text.active;
  if (status === "suspended") return text.suspended;
  return text.archived;
}

function StatusBadge({ status, text }: { status: AeroCustomerStatus; text: DashboardCopy }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-0 px-2.5 py-1 font-black",
        status === "active" && "bg-lime/35 text-emerald-900",
        status === "suspended" && "bg-amber-100 text-amber-800",
        status === "archived" && "bg-zinc-100 text-zinc-500",
      )}
    >
      {statusLabel(status, text)}
    </Badge>
  );
}

function SummaryCard({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Store }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-zinc-500">{label}</p>
        <span className="grid size-9 place-items-center rounded-xl bg-zinc-100"><Icon className="size-4" aria-hidden="true" /></span>
      </div>
      <p className="mt-4 text-3xl font-black tracking-[-0.05em]">{value.toLocaleString()}</p>
    </div>
  );
}

function UsageCell({ label, value, limit }: { label: string; value: number; limit?: number }) {
  return (
    <div className="rounded-xl bg-zinc-50 p-3">
      <p className="text-[11px] font-black uppercase tracking-[0.08em] text-zinc-500">{label}</p>
      <p className={cn("mt-1 text-lg font-black", limit !== undefined && value > limit ? "text-red-600" : "text-black")}>
        {value.toLocaleString()}{limit !== undefined ? ` / ${limit.toLocaleString()}` : ""}
      </p>
    </div>
  );
}

function SaveButton({ text }: { text: DashboardCopy }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="h-10 rounded-xl bg-black px-5 font-black text-white hover:bg-black">
      {pending ? text.saving : text.save}
    </Button>
  );
}

function CustomerSettings({ customer, text }: { customer: AeroSuperAdminCustomer; text: DashboardCopy }) {
  const [state, action] = useActionState(updateAeroCustomerAction, initialActionState);
  const isArchived = customer.status === "archived";

  return (
    <form action={action} className="mt-5 border-t border-zinc-200 pt-5">
      <input type="hidden" name="organizationId" value={customer.organizationId} />
      <p className="text-xs font-black uppercase tracking-[0.1em] text-zinc-500">{text.accessAndLimits}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1.5 text-xs font-bold text-zinc-600">
          {text.adminSeats}
          <Input name="adminLimit" type="number" min={1} max={1_000} required disabled={isArchived} defaultValue={customer.adminLimit} className="h-10 rounded-xl bg-white text-black" />
        </label>
        <label className="grid gap-1.5 text-xs font-bold text-zinc-600">
          {text.staffSeats}
          <Input name="staffLimit" type="number" min={0} max={10_000} required disabled={isArchived} defaultValue={customer.staffLimit} className="h-10 rounded-xl bg-white text-black" />
        </label>
        <label className="grid gap-1.5 text-xs font-bold text-zinc-600">
          {text.workspaceStatus}
          <NativeSelect name="status" required disabled={isArchived} defaultValue={customer.status} className="h-10 rounded-xl bg-white text-black">
            <NativeSelectOption value="active">{text.active}</NativeSelectOption>
            <NativeSelectOption value="suspended">{text.suspended}</NativeSelectOption>
          </NativeSelect>
        </label>
      </div>
      <div className="mt-3 flex min-h-10 flex-wrap items-center justify-between gap-3">
        <p
          role={state.status === "error" ? "alert" : "status"}
          aria-live="polite"
          className={cn("text-xs font-bold", state.status === "error" ? "text-red-600" : "text-emerald-700")}
        >
          {isArchived ? text.archivedReadOnly : translatedActionMessage(state.message, text)}
        </p>
        {isArchived ? null : <SaveButton text={text} />}
      </div>
    </form>
  );
}

function CustomerCard({ customer, text, locale }: { customer: AeroSuperAdminCustomer; text: DashboardCopy; locale: keyof typeof dateFormatters }) {
  const adminIdentity = customer.primaryAdminName || customer.primaryAdminEmail || "—";
  const secondaryAdminIdentity = customer.primaryAdminName && customer.primaryAdminEmail ? customer.primaryAdminEmail : null;
  const occupiedAdminSeats = customer.activeAdminCount + customer.invitedAdminCount + customer.reservedAdminCount;
  const occupiedStaffSeats = customer.activeStaffCount + customer.invitedStaffCount + customer.reservedStaffCount;

  return (
    <article className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm [content-visibility:auto] [contain-intrinsic-size:auto_520px] sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-black tracking-[-0.04em]">{customer.name}</h2>
            <StatusBadge status={customer.status} text={text} />
          </div>
          <p className="mt-1 truncate text-xs font-bold text-zinc-500">{customer.slug || customer.organizationId}</p>
        </div>
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-black text-lg font-black text-lime">
          {customer.icon || customer.name.slice(0, 1).toUpperCase()}
        </span>
      </div>

      <dl className="mt-5 grid gap-3 border-y border-zinc-200 py-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-bold text-zinc-500">{text.primaryAdmin}</dt>
          <dd className="mt-1 break-words font-black">{adminIdentity}</dd>
          {secondaryAdminIdentity ? <dd className="mt-0.5 break-all text-xs font-semibold text-zinc-500">{secondaryAdminIdentity}</dd> : null}
        </div>
        <div>
          <dt className="text-xs font-bold text-zinc-500">{text.plan}</dt>
          <dd className="mt-1 font-black capitalize">{customer.plan}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-zinc-500">{text.lastLogin}</dt>
          <dd className="mt-1 font-black">{formatDate(customer.lastLoginAt, locale, text.never)}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-zinc-500">{text.created}</dt>
          <dd className="mt-1 font-black">{formatDate(customer.createdAt, locale, "—")}</dd>
        </div>
      </dl>

      <p className="mt-4 text-xs font-black uppercase tracking-[0.1em] text-zinc-500">{text.usage}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <UsageCell label={text.adminSeats} value={occupiedAdminSeats} limit={customer.adminLimit} />
        <UsageCell label={text.staffSeats} value={occupiedStaffSeats} limit={customer.staffLimit} />
        <UsageCell label={text.members} value={customer.memberCount} />
        <UsageCell label={text.skus} value={customer.skuCount} limit={customer.skuLimit} />
        <UsageCell label={text.warehouses} value={customer.warehouseCount} limit={customer.warehouseLimit} />
        <UsageCell label={text.viewers} value={customer.activeViewerCount} />
      </div>
      <p className="mt-2 text-[11px] font-semibold text-zinc-500">
        {text.adminSeats}: {customer.activeAdminCount} {text.activeSeat} · {customer.invitedAdminCount} {text.invitedSeat} · {customer.reservedAdminCount} {text.used}
        <br />
        {text.staffSeats}: {customer.activeStaffCount} {text.activeSeat} · {customer.invitedStaffCount} {text.invitedSeat} · {customer.reservedStaffCount} {text.used}
      </p>

      <CustomerSettings customer={customer} text={text} />

      <p className="mt-4 truncate text-[10px] font-semibold text-zinc-400" title={customer.organizationId}>
        {text.workspaceId}: {customer.organizationId}
      </p>
    </article>
  );
}

export function AeroSuperAdminDashboard({ customers, accountEmail }: { customers: AeroSuperAdminCustomer[]; accountEmail: string }) {
  const { locale } = useLocale();
  const text = copy[locale];
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | AeroCustomerStatus>("all");
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase());

  const summary = useMemo(() => {
    let active = 0;
    let members = 0;
    let skus = 0;
    for (const customer of customers) {
      if (customer.status === "active") active += 1;
      members += customer.memberCount;
      skus += customer.skuCount;
    }
    return { active, members, skus };
  }, [customers]);

  const filteredCustomers = useMemo(() => customers.filter((customer) => {
    if (status !== "all" && customer.status !== status) return false;
    if (!deferredSearch) return true;

    return [
      customer.name,
      customer.slug,
      customer.organizationId,
      customer.primaryAdminName,
      customer.primaryAdminEmail,
    ].some((value) => value?.toLocaleLowerCase().includes(deferredSearch));
  }), [customers, deferredSearch, status]);

  const clearFilters = () => {
    setSearch("");
    setStatus("all");
  };

  return (
    <main className="min-h-screen bg-zinc-50 px-3 pb-24 pt-4 text-black sm:px-8 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link href="/workspaces" aria-label={text.back} className="inline-flex items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-lime">
              <Image src={aeroLogo} alt="Aero" className="h-auto w-28" priority />
              <span className="rounded-full bg-black px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-lime">Admin</span>
            </Link>
            <p className="mt-6 text-xs font-black uppercase tracking-[0.16em] text-zinc-500">{text.eyebrow}</p>
            <h1 className="mt-1 text-3xl font-black tracking-[-0.055em] sm:text-5xl">{text.title}</h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold text-zinc-600 sm:text-base">{text.description}</p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <p className="max-w-xs truncate text-xs font-bold text-zinc-500">{text.signedIn}: {accountEmail}</p>
            <Button asChild variant="outline" className="h-10 rounded-xl bg-white px-4 font-black">
              <Link href="/workspaces"><ArrowLeft className="size-4" aria-hidden="true" />{text.back}</Link>
            </Button>
          </div>
        </header>

        <section aria-label="Customer totals" className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label={text.customers} value={customers.length} icon={Store} />
          <SummaryCard label={text.activeCustomers} value={summary.active} icon={ShieldCheck} />
          <SummaryCard label={text.members} value={summary.members} icon={Users} />
          <SummaryCard label={text.skus} value={summary.skus} icon={Boxes} />
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
            <label className="relative block">
              <span className="sr-only">{text.search}</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={text.search} className="h-11 rounded-xl bg-white pl-10" />
            </label>
            <NativeSelect value={status} onChange={(event) => setStatus(event.target.value as "all" | AeroCustomerStatus)} className="h-11 rounded-xl bg-white">
              <NativeSelectOption value="all">{text.allStatuses}</NativeSelectOption>
              <NativeSelectOption value="active">{text.active}</NativeSelectOption>
              <NativeSelectOption value="suspended">{text.suspended}</NativeSelectOption>
              <NativeSelectOption value="archived">{text.archived}</NativeSelectOption>
            </NativeSelect>
          </div>
        </section>

        {filteredCustomers.length > 0 ? (
          <section aria-label={text.customers} className="mt-5 grid items-start gap-4 lg:grid-cols-2">
            {filteredCustomers.map((customer) => <CustomerCard key={customer.organizationId} customer={customer} text={text} locale={locale} />)}
          </section>
        ) : (
          <section className="mt-5 grid min-h-72 place-items-center rounded-3xl border border-dashed border-zinc-300 bg-white p-8 text-center">
            <div>
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-zinc-100"><Building2 className="size-5" aria-hidden="true" /></span>
              <h2 className="mt-4 text-xl font-black">{customers.length === 0 ? text.noCustomers : text.noMatches}</h2>
              <p className="mt-2 text-sm font-semibold text-zinc-500">{customers.length === 0 ? text.noCustomersDescription : text.noMatchesDescription}</p>
              {customers.length > 0 ? <Button type="button" variant="outline" onClick={clearFilters} className="mt-5 rounded-xl bg-white font-black">{text.clear}</Button> : null}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
