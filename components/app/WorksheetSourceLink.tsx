"use client";

interface WorksheetSourceLinkProps {
  href?: string | null;
  className?: string;
}

export function WorksheetSourceLink({ href, className }: WorksheetSourceLinkProps) {
  if (!href) {
    return null;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={className ?? "font-medium text-[var(--brand-primary,#0B2739)] underline underline-offset-2"}
    >
      View Source
    </a>
  );
}
