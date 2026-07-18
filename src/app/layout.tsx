import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";

import { GlobalLoadingIndicator } from "@/components/global-loading-indicator";
import { LanguageSwitcher, LocaleProvider } from "@/components/locale-provider";
import { Toaster } from "@/components/ui/toast";
import { AERO_LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Aero Stock / Inventory",
  description: "Aero pet store inventory dashboard scaffolded with Next and Unlumen UI.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Aero",
    statusBarStyle: "black-translucent",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = normalizeLocale((await cookies()).get(AERO_LOCALE_COOKIE)?.value);

  return (
    <html lang={locale === "zh" ? "zh-CN" : locale}>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <LocaleProvider initialLocale={locale}>
          <GlobalLoadingIndicator />
          <LanguageSwitcher />
          {children}
          <Toaster />
        </LocaleProvider>
      </body>
    </html>
  );
}
