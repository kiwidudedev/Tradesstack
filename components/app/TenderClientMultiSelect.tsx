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

export type TenderClientOption = {
  id: string;
  name: string | null;
  company_name: string | null;
  email?: string | null;
};

export function getTenderClientLabel(client: TenderClientOption): string {
  return client.company_name?.trim() || client.name?.trim() || "Unknown Company";
}

export function withPrimaryTenderClient(selectedIds: string[], primaryClientId: string): string[] {
  if (!primaryClientId || primaryClientId === "__new_client__") return Array.from(new Set(selectedIds));
  return Array.from(new Set([...selectedIds, primaryClientId]));
}

export function toggleTenderClientSelection(
  selectedIds: string[],
  clientId: string,
  checked: boolean,
  primaryClientId: string,
): string[] {
  if (clientId === primaryClientId) return withPrimaryTenderClient(selectedIds, primaryClientId);
  const next = checked
    ? [...selectedIds, clientId]
    : selectedIds.filter((selectedId) => selectedId !== clientId);
  return withPrimaryTenderClient(next, primaryClientId);
}

export function filterTenderClients(clients: TenderClientOption[], query: string): TenderClientOption[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return clients;
  return clients.filter((client) =>
    `${client.company_name ?? ""} ${client.name ?? ""} ${client.email ?? ""}`.toLocaleLowerCase().includes(normalizedQuery),
  );
}

export function summarizeTenderClientSelection(
  clients: TenderClientOption[],
  selectedIds: string[],
  primaryClientId: string,
): string {
  const selected = new Set(withPrimaryTenderClient(selectedIds, primaryClientId));
  const ordered = [
    ...clients.filter((client) => client.id === primaryClientId && selected.has(client.id)),
    ...clients.filter((client) => client.id !== primaryClientId && selected.has(client.id)),
  ];
  const labels = ordered.map(getTenderClientLabel);
  if (labels.length === 0) return "Select tender clients";
  if (labels.length <= 2) return labels.join(", ");
  return `${labels[0]}, ${labels[1]} +${labels.length - 2} more`;
}

type TenderClientMultiSelectProps = {
  clients: TenderClientOption[];
  selectedIds: string[];
  primaryClientId: string;
  onChange: (selectedIds: string[]) => void;
  disabled?: boolean;
  id?: string;
};

export function TenderClientMultiSelect({
  clients,
  selectedIds,
  primaryClientId,
  onChange,
  disabled = false,
  id,
}: TenderClientMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const effectiveSelectedIds = useMemo(
    () => withPrimaryTenderClient(selectedIds, primaryClientId),
    [primaryClientId, selectedIds],
  );
  const filteredClients = useMemo(() => filterTenderClients(clients, query), [clients, query]);
  const summary = summarizeTenderClientSelection(clients, selectedIds, primaryClientId);

  useEffect(() => {
    if (!open) return;
    const focusFrame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(focusFrame);
  }, [open]);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery("");
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-label="Tender Clients"
          className="flex h-[2.75rem] w-full items-center rounded-[0.6rem] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-left text-[14px] font-medium text-[var(--text-primary)] outline-none transition focus-visible:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className={summary === "Select tender clients" ? "min-w-0 flex-1 truncate text-[var(--text-muted)]" : "min-w-0 flex-1 truncate"}>
            {summary}
          </span>
          <ChevronDown className="ml-3 h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[var(--radix-dropdown-menu-trigger-width)] p-0"
      >
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
            placeholder="Search clients..."
            aria-label="Search tender clients"
            className="h-9 w-full rounded-[0.45rem] border border-[var(--border)] bg-[var(--surface)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]"
          />
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="max-h-64 overflow-y-auto p-1">
          {filteredClients.length > 0 ? filteredClients.map((client) => {
            const isPrimary = client.id === primaryClientId;
            return (
              <DropdownMenuCheckboxItem
                key={client.id}
                checked={effectiveSelectedIds.includes(client.id)}
                disabled={isPrimary}
                onCheckedChange={(checked) => onChange(toggleTenderClientSelection(
                  effectiveSelectedIds,
                  client.id,
                  checked === true,
                  primaryClientId,
                ))}
                onSelect={(event) => event.preventDefault()}
                className="min-h-9"
              >
                <span className="min-w-0 flex-1 truncate">{getTenderClientLabel(client)}</span>
                {isPrimary ? <span className="ml-3 text-xs text-[var(--text-muted)]">Primary</span> : null}
              </DropdownMenuCheckboxItem>
            );
          }) : (
            <p className="px-3 py-5 text-center text-sm text-[var(--text-secondary)]">No clients found.</p>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
