"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Globe2 } from "lucide-react";

import { AERO_LOCALE_COOKIE, normalizeLocale, translateInterfaceText, type AppLocale } from "@/lib/i18n";

type LocaleContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

const translatedAttributes = ["placeholder", "title", "aria-label"] as const;
const ignoredTags = new Set(["SCRIPT", "STYLE", "CODE", "PRE"]);

type TextRecord = { source: string; applied: string };
type AttributeRecord = Record<string, { source: string; applied: string }>;

function shouldIgnore(node: Node) {
  const element = node instanceof Element ? node : node.parentElement;
  return !element || Boolean(element.closest("[data-i18n-ignore], [contenteditable='true']")) || ignoredTags.has(element.tagName);
}

export function LocaleProvider({ initialLocale, children }: { initialLocale: AppLocale; children: ReactNode }) {
  const [locale, setLocaleState] = useState(initialLocale);

  useEffect(() => {
    const textRecords = new WeakMap<Text, TextRecord>();
    const attributeRecords = new WeakMap<Element, AttributeRecord>();

    function translateNode(node: Node) {
      if (shouldIgnore(node)) return;

      if (node instanceof Text) {
        const current = node.nodeValue ?? "";
        const previous = textRecords.get(node);
        const source = previous && current === previous.applied ? previous.source : current;
        const applied = translateInterfaceText(source, locale);
        textRecords.set(node, { source, applied });
        if (current !== applied) node.nodeValue = applied;
        return;
      }

      if (!(node instanceof Element)) return;
      const stored = attributeRecords.get(node) ?? {};
      for (const attribute of translatedAttributes) {
        const current = node.getAttribute(attribute);
        if (!current) continue;
        const previous = stored[attribute];
        const source = previous && current === previous.applied ? previous.source : current;
        const applied = translateInterfaceText(source, locale);
        stored[attribute] = { source, applied };
        if (current !== applied) node.setAttribute(attribute, applied);
      }
      attributeRecords.set(node, stored);

      for (const child of node.childNodes) translateNode(child);
    }

    function restoreNode(node: Node) {
      if (node instanceof Text) {
        const record = textRecords.get(node);
        if (record && node.nodeValue === record.applied) node.nodeValue = record.source;
        return;
      }
      if (!(node instanceof Element)) return;
      const stored = attributeRecords.get(node);
      if (stored) {
        for (const attribute of translatedAttributes) {
          const record = stored[attribute];
          if (record && node.getAttribute(attribute) === record.applied) node.setAttribute(attribute, record.source);
        }
      }
      for (const child of node.childNodes) restoreNode(child);
    }

    document.documentElement.lang = locale === "zh" ? "zh-CN" : locale;
    translateNode(document.body);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") translateNode(mutation.target);
        if (mutation.type === "attributes") translateNode(mutation.target);
        for (const node of mutation.addedNodes) translateNode(node);
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...translatedAttributes],
    });
    return () => {
      observer.disconnect();
      restoreNode(document.body);
    };
  }, [locale]);

  const setLocale = useCallback((nextLocale: AppLocale) => {
    const normalized = normalizeLocale(nextLocale);
    setLocaleState(normalized);
    document.cookie = `${AERO_LOCALE_COOKIE}=${normalized}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used inside LocaleProvider");
  return value;
}

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();

  return (
    <label
      data-i18n-ignore
      className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-3 z-[90] flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white/95 px-2 text-xs font-black text-black shadow-lg shadow-black/10 backdrop-blur-xl lg:bottom-4 lg:right-4"
    >
      <Globe2 className="size-3.5" aria-hidden="true" />
      <span className="sr-only">Language</span>
      <select
        aria-label="Language"
        value={locale}
        onChange={(event) => setLocale(normalizeLocale(event.target.value))}
        className="bg-transparent pr-1 outline-none"
      >
        <option value="en">EN</option>
        <option value="zh">中文</option>
        <option value="th">ไทย</option>
      </select>
    </label>
  );
}
