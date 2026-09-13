"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { QuotePublishOption } from "@/lib/commercial-items/quote-destination-adapter";
import { opportunityQuoteRevisionLabel } from "@/lib/opportunity-quote-display";

export function getQuoteDestinationLabel(quote: QuotePublishOption) {
  return `${quote.quoteNumber} · ${quote.recipientName || "Recipient"} · ${opportunityQuoteRevisionLabel(quote.revisionNumber)}`;
}

export function toggleQuoteDestinationSelection(selectedIds: string[], quoteId: string, checked: boolean) {
  return checked
    ? Array.from(new Set([...selectedIds, quoteId]))
    : selectedIds.filter((selectedId) => selectedId !== quoteId);
}

export function filterQuoteDestinations(quotes: QuotePublishOption[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return quotes;
  return quotes.filter((quote) =>
    `${quote.quoteNumber} ${quote.recipientName ?? ""} ${opportunityQuoteRevisionLabel(quote.revisionNumber)}`
      .toLocaleLowerCase()
      .includes(normalizedQuery),
  );
}

export function summarizeQuoteDestinationSelection(quotes: QuotePublishOption[], selectedIds: string[]) {
  const selected = new Set(selectedIds);
  const selectedQuotes = quotes.filter((quote) => selected.has(quote.id));
  if (selectedQuotes.length === 0) return "Select draft Quotes";
  if (selectedQuotes.length === 1) return getQuoteDestinationLabel(selectedQuotes[0]);
  return `${selectedQuotes.length} draft Quotes selected`;
}

export function QuoteDestinationMultiSelect({
  quotes,
  selectedIds,
  onChange,
  disabled = false,
}: {
  quotes: QuotePublishOption[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const filteredQuotes = useMemo(() => filterQuoteDestinations(quotes, query), [query, quotes]);
  const summary = summarizeQuoteDestinationSelection(quotes, selectedIds);

  useEffect(() => {
    if (!open) return;
    const focusFrame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(focusFrame);
  }, [open]);

  return (
    <DropdownMenu open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (!nextOpen) setQuery("");
    }}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="Draft Quotes"
          className="flex h-10 w-full items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-left text-sm text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)] disabled:text-[var(--text-muted)]"
        >
          <span className={`min-w-0 flex-1 truncate ${selectedIds.length === 0 ? "text-[var(--text-muted)]" : ""}`}>{summary}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] p-0">
        <div className="relative p-2">
          <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
          <input
            ref={searchRef}
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (!["Escape", "ArrowDown", "ArrowUp"].includes(event.key)) event.stopPropagation();
            }}
            placeholder="Search draft Quotes..."
            aria-label="Search draft Quotes"
            className="h-9 w-full rounded-[0.45rem] border border-[var(--border)] bg-[var(--surface)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]"
          />
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="max-h-64 overflow-y-auto p-1">
          {filteredQuotes.length > 0 ? filteredQuotes.map((quote) => (
            <DropdownMenuCheckboxItem
              key={quote.id}
              checked={selectedIds.includes(quote.id)}
              onCheckedChange={(checked) => onChange(toggleQuoteDestinationSelection(selectedIds, quote.id, checked === true))}
              onSelect={(event) => event.preventDefault()}
              className="min-h-9"
            >
              <span className="min-w-0 flex-1 truncate">{getQuoteDestinationLabel(quote)}</span>
            </DropdownMenuCheckboxItem>
          )) : <p className="px-3 py-5 text-center text-sm text-[var(--text-secondary)]">No draft Quotes found.</p>}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
