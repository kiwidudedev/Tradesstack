"use client";

import { useState, useTransition } from "react";
import { Link2, RefreshCw, Search, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ClientXeroContactChoice, ClientXeroLinkWorkspaceData } from "@/lib/xero/client-contacts";
import {
  createClientXeroContactAction,
  linkClientXeroContactAction,
  loadClientXeroWorkspaceAction,
  refreshClientXeroContactsAction,
  unlinkClientXeroContactAction,
  type ClientXeroActionResult,
} from "./actions";
import styles from "./client-detail.module.css";

function ChoiceRow({
  choice,
  currentLinked,
  disabled,
  onSelect,
}: {
  choice: ClientXeroContactChoice;
  currentLinked: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const linkedElsewhere = Boolean(choice.linkedClientId);
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900">{choice.name}</p>
        <p className="truncate text-xs text-slate-500">
          {[choice.email, choice.phone ?? choice.mobile, choice.reasons.join(" · ")].filter(Boolean).join(" · ") || "Imported Xero Contact"}
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || linkedElsewhere}
        onClick={onSelect}
      >
        {linkedElsewhere ? "Linked elsewhere" : currentLinked ? "Relink" : "Link"}
      </Button>
    </div>
  );
}

export function ClientXeroContactPanel({
  clientId,
  initialWorkspace,
  initialError,
  canManage,
}: {
  clientId: string;
  initialWorkspace: ClientXeroLinkWorkspaceData | null;
  initialError?: string | null;
  canManage: boolean;
}) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [error, setError] = useState(initialError ?? null);
  const [searchTerm, setSearchTerm] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [isPending, startTransition] = useTransition();

  function applyResult(result: ClientXeroActionResult) {
    if (result.workspace) setWorkspace(result.workspace);
    setError(result.error ?? null);
    setDuplicateWarning(Boolean(result.requiresDuplicateConfirmation));
  }

  function run(action: () => Promise<ClientXeroActionResult>) {
    setError(null);
    startTransition(async () => applyResult(await action()));
  }

  const connected = workspace?.connectionStatus === "connected";

  return (
    <Card className={`${styles.card} ${styles.fullWidthCard}`}>
      <CardHeader className={styles.sectionHeader}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className={styles.sectionTitle}>Xero Contact</CardTitle>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${connected ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
            {connected ? "Xero connected" : "Xero not connected"}
          </span>
        </div>
      </CardHeader>
      <CardContent className={`${styles.cardBody} space-y-4`}>
        {error ? (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        {workspace?.currentLink ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <Link2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {workspace.currentLink.externalContactName ?? "Linked Xero Contact"}
                </p>
                <p className="text-xs text-slate-500">
                  {workspace.currentLink.status === "linked" ? "Linked" : workspace.currentLink.status === "external_archived" ? "Archived in Xero — relink required" : "Link needs attention"}
                </p>
              </div>
            </div>
            {canManage ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => {
                  if (window.confirm("Unlink this client from its Xero Contact?")) {
                    run(() => unlinkClientXeroContactAction({ clientId, confirmed: true }));
                  }
                }}
              >
                <Unlink className="mr-1.5 h-4 w-4" /> Unlink
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-slate-600">This client is not linked to a Xero Contact.</p>
        )}

        {connected ? (
          <>
            <div className="flex flex-wrap gap-2">
              <form
                className="flex min-w-[260px] flex-1 gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  run(() => loadClientXeroWorkspaceAction({ clientId, searchTerm }));
                }}
              >
                <Input
                  aria-label="Search imported Xero Contacts"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search Xero Contacts by name, email or phone"
                  disabled={isPending}
                />
                <Button type="submit" variant="outline" disabled={isPending || !searchTerm.trim()}>
                  <Search className="h-4 w-4" />
                  <span className="sr-only">Search</span>
                </Button>
              </form>
              {canManage ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => run(() => refreshClientXeroContactsAction({ clientId }))}
                >
                  <RefreshCw className={`mr-1.5 h-4 w-4 ${isPending ? "animate-spin" : ""}`} /> Refresh
                </Button>
              ) : null}
            </div>

            {(workspace?.searchResults.length ?? 0) > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Search results</p>
                {workspace!.searchResults.map((choice) => (
                  <ChoiceRow
                    key={choice.importedContactId}
                    choice={choice}
                    currentLinked={Boolean(workspace?.currentLink)}
                    disabled={!canManage || isPending}
                    onSelect={() => run(() => linkClientXeroContactAction({
                      clientId,
                      importedContactId: choice.importedContactId,
                      allowRelink: Boolean(workspace?.currentLink),
                      matchMethod: workspace?.currentLink ? "manual_relink" : "manual_search",
                    }))}
                  />
                ))}
              </div>
            ) : null}

            {(workspace?.suggestions.length ?? 0) > 0 && !searchTerm ? (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Suggested imported Contacts</p>
                {workspace!.suggestions.map((choice) => (
                  <ChoiceRow
                    key={choice.importedContactId}
                    choice={choice}
                    currentLinked={Boolean(workspace?.currentLink)}
                    disabled={!canManage || isPending}
                    onSelect={() => run(() => linkClientXeroContactAction({
                      clientId,
                      importedContactId: choice.importedContactId,
                      allowRelink: Boolean(workspace?.currentLink),
                      matchMethod: workspace?.currentLink ? "manual_relink" : "suggested_match",
                    }))}
                  />
                ))}
              </div>
            ) : null}

            {canManage && !workspace?.currentLink ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                <p className="text-sm text-slate-600">Create a Contact from this client’s saved name, email, phone and primary address.</p>
                <Button
                  type="button"
                  disabled={isPending}
                  onClick={() => run(() => createClientXeroContactAction({
                    clientId,
                    allowPotentialDuplicate: duplicateWarning,
                  }))}
                >
                  Create and link
                </Button>
              </div>
            ) : null}
            {duplicateWarning ? (
              <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                A possible matching Contact exists. Review the suggestions, or select “Create and link” again to confirm a new Contact.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-slate-500">Connect Xero and select a tenant in Integrations to manage this link.</p>
        )}
      </CardContent>
    </Card>
  );
}
