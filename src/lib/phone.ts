export function normalizeWhatsAppNumber(country: "MY" | "TH", phone: string) {
  const digits = phone.replace(/\D/g, "");

  if (country === "MY") {
    if (digits.startsWith("60")) return digits;
    if (digits.startsWith("0")) return `60${digits.slice(1)}`;
    return `60${digits}`;
  }

  if (digits.startsWith("66")) return digits;
  if (digits.startsWith("0")) return `66${digits.slice(1)}`;
  return `66${digits}`;
}
