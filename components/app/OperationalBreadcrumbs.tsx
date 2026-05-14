import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface OperationalBreadcrumbItem {
  label: React.ReactNode;
  href?: string;
}

interface OperationalBreadcrumbsProps extends React.HTMLAttributes<HTMLElement> {
  items: OperationalBreadcrumbItem[];
}

export function OperationalBreadcrumbs({
  items,
  className,
  ...props
}: OperationalBreadcrumbsProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium",
        className,
      )}
      {...props}
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const linkable = Boolean(item.href) && !isLast;

        return (
          <React.Fragment key={index}>
            {linkable ? (
              <Link
                href={item.href as string}
                className="text-[var(--text-primary)] transition hover:underline hover:underline-offset-4"
              >
                {item.label}
              </Link>
            ) : (
              <span
                aria-current={isLast ? "page" : undefined}
                className={cn(
                  isLast ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]",
                )}
              >
                {item.label}
              </span>
            )}
            {!isLast ? (
              <ChevronRight
                aria-hidden="true"
                strokeWidth={2.4}
                className="h-4 w-4 shrink-0 text-[var(--text-muted)]"
              />
            ) : null}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
