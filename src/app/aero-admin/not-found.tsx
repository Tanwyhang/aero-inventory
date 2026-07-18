"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/locale-provider";

const copy = {
  en: {
    eyebrow: "Page unavailable",
    title: "This page could not be found",
    body: "The page does not exist, or your account does not have access.",
    back: "Back to Aero",
  },
  zh: {
    eyebrow: "页面不可用",
    title: "找不到此页面",
    body: "此页面不存在，或你的账户没有访问权限。",
    back: "返回 Aero",
  },
  th: {
    eyebrow: "ไม่สามารถเข้าถึงหน้านี้",
    title: "ไม่พบหน้านี้",
    body: "หน้านี้ไม่มีอยู่ หรือบัญชีของคุณไม่มีสิทธิ์เข้าถึง",
    back: "กลับไปที่ Aero",
  },
} as const;

export default function AeroAdminNotFound() {
  const { locale } = useLocale();
  const text = copy[locale];

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-50 px-5 text-black">
      <section className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-sm sm:p-10">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">{text.eyebrow}</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.05em]">{text.title}</h1>
        <p className="mt-3 text-sm font-semibold text-zinc-600">{text.body}</p>
        <Button asChild className="mt-6 h-11 rounded-xl bg-black px-6 font-black text-white hover:bg-black">
          <Link href="/workspaces">{text.back}</Link>
        </Button>
      </section>
    </main>
  );
}
