type ActionErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  name?: string | null;
};

const safeMessageRules: Array<{ matches: RegExp; message: string }> = [
  { matches: /admin access required/i, message: "Admin access required." },
  { matches: /workspace access required|not authorized/i, message: "You do not have access to that workspace." },
  { matches: /stock cannot go below zero/i, message: "Stock cannot go below zero." },
  { matches: /stock (has )?changed|quantity conflict|expected quantity/i, message: "Stock changed since this page loaded. Refresh and try again." },
  { matches: /inventory row not found/i, message: "Inventory is no longer available. Refresh and try again." },
  { matches: /sku (is )?(archived|inactive)/i, message: "This SKU is archived and can no longer be changed." },
  { matches: /active partner share|remove archived skus/i, message: "Resolve this SKU's active Partner Share sheets before archiving." },
  { matches: /sku limit reached/i, message: "The workspace SKU limit has been reached." },
  { matches: /duplicate key|already exists|unique constraint/i, message: "That record already exists. Check the SKU code or name." },
  { matches: /share quantity cannot exceed current stock/i, message: "Share quantity cannot exceed current stock." },
  { matches: /stock already deducted/i, message: "Stock was already deducted for this sheet." },
  { matches: /stock-deducted sheets cannot|stock-deducted sheets can only/i, message: "Stock was already deducted; this sheet is now read-only except for completion." },
  { matches: /stock can only be deducted/i, message: "Send or complete the sheet before deducting stock." },
  { matches: /disable auto-sync before editing/i, message: "Disable auto-sync before editing the share quantity." },
  { matches: /invite is no longer valid|invalid invite/i, message: "The workspace invite is invalid or no longer available." },
  { matches: /different email address/i, message: "This invite belongs to a different Google account." },
];

function errorLike(error: unknown): ActionErrorLike {
  if (error instanceof Error) return { name: error.name, message: error.message };
  if (error && typeof error === "object") return error as ActionErrorLike;
  return { message: typeof error === "string" ? error : null };
}

export function safeActionError(error: unknown, context: string, fallback: string) {
  const value = errorLike(error);
  const reference = crypto.randomUUID().slice(0, 8).toUpperCase();

  console.error("Aero server action failed", {
    context,
    reference,
    name: value.name ?? null,
    code: value.code ?? null,
    message: value.message ?? null,
    details: value.details ?? null,
    hint: value.hint ?? null,
  });

  const source = value.message ?? "";
  const safeMessage = safeMessageRules.find((rule) => rule.matches.test(source))?.message;
  return safeMessage ?? `${fallback} Reference ${reference}.`;
}
