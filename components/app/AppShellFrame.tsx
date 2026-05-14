"use client";

import { AppPageSurface } from "@/components/app/AppPageSurface";
import { usePathname } from "next/navigation";

export function AppShellFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isSupplierInvoiceDetailPage =
    pathname.startsWith("/app/company/supplier-invoices/") &&
    pathname !== "/app/company/supplier-invoices";

  return (
    <main
      className={`min-w-0 flex-1 p-1.5 sm:p-4 ${
        isSupplierInvoiceDetailPage ? "bg-[var(--surface-muted)]" : "bg-[var(--background)]"
      }`}
    >
      <AppPageSurface>{children}</AppPageSurface>
    </main>
  );
}
