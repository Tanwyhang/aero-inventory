import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function digitsOnly(phone: string) {
  return phone.replace(/\D/g, "");
}

function whatsappHref(phone: string, product: string) {
  const number = digitsOnly(phone);
  const message = encodeURIComponent(`Hi, I need to check stock for ${product}.`);
  return `https://wa.me/${number}?text=${message}`;
}

export function WhatsAppLink({
  phone,
  product,
  supplier,
  label = "WhatsApp",
  className,
}: {
  phone: string;
  product: string;
  supplier?: string;
  label?: string;
  className?: string;
}) {
  const href = whatsappHref(phone, product);

  return (
    <Button asChild className={className}>
      <Link
        href={href}
        target="_blank"
        rel="noreferrer"
        aria-label={supplier ? `Contact ${supplier} on WhatsApp` : `Contact on WhatsApp`}
      >
        <Image src="/icons/whatsapp.png" alt="" aria-hidden="true" width={18} height={18} />
        {label}
      </Link>
    </Button>
  );
}
