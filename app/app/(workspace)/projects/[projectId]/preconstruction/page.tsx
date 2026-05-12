import Link from "next/link";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import { Button } from "@/components/ui/button";

const FINANCIAL_LINKS = [
  { href: "quote", label: "Quote" },
  { href: "variations", label: "Variations" },
  { href: "purchase-orders", label: "Purchase Orders" },
  { href: "claims", label: "Claims" },
] as const;

export default function PreconstructionPage() {
  return (
    <OperationalPanel
      title="Financial"
      description="Open financial workflows for this project."
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">Navigation</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {FINANCIAL_LINKS.map((entry) => (
          <Button key={entry.href} asChild variant="secondary" size="sm">
            <Link href={entry.href}>{entry.label}</Link>
          </Button>
        ))}
      </div>
    </OperationalPanel>
  );
}
