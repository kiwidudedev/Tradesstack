"use client";

import { AppPageSurface } from "@/components/app/AppPageSurface";
import { Topbar } from "@/components/app/Topbar";
import { usePathname } from "next/navigation";

export function AppShellFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isSupplierInvoiceDetailPage =
    pathname.startsWith("/app/company/supplier-invoices/") &&
    pathname !== "/app/company/supplier-invoices";

  return (
    <main
      className={`min-w-0 flex-1 p-[0.384rem] sm:p-[1.024rem] ${
        isSupplierInvoiceDetailPage ? "bg-[#F2F3F4]" : "bg-[#FBFEFE]"
      }`}
    >
      <Topbar />
      <AppPageSurface>{children}</AppPageSurface>
    </main>
  );
}
