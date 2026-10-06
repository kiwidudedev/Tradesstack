"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Bot, ChevronDown, MoreHorizontal, Pin } from "lucide-react";
import { usePathname } from "next/navigation";
import type { OrganizationProject } from "@/lib/projects";
import { AiChatbotPanel } from "@/components/app/AiChatbotPanel";

type AssistantShellContextValue = { open: () => void; close: () => void; isOpen: boolean };
const AssistantShellContext = createContext<AssistantShellContextValue | null>(null);

export function useAssistantShell() {
  const value = useContext(AssistantShellContext);
  if (!value) throw new Error("useAssistantShell must be used inside AssistantShellProvider");
  return value;
}

function getRouteProjectSlug(pathname: string, projects: OrganizationProject[]) {
  const match = pathname.match(/^\/app\/projects\/([^/]+)/);
  const candidate = match?.[1];
  return projects.some((project) => project.slug === candidate) ? candidate : null;
}

export function AssistantShellProvider({
  children,
  projects,
}: {
  children: React.ReactNode;
  projects: OrganizationProject[];
}) {
  const [isOpen, setIsOpen] = useState(() =>
    typeof window !== "undefined" && window.location.search.includes("assistant=open"),
  );
  const [newChatKey, setNewChatKey] = useState(0);
  const pathname = usePathname();

  const projectSlug = useMemo(() => getRouteProjectSlug(pathname, projects), [pathname, projects]);
  const selectedProject = projects.find((project) => project.slug === projectSlug);
  const contextValue = useMemo(
    () => ({ open: () => setIsOpen(true), close: () => setIsOpen(false), isOpen }),
    [isOpen],
  );

  useEffect(() => {
    const openFromShell = () => setIsOpen(true);
    window.addEventListener("tradesstack:open-assistant", openFromShell);
    if (window.location.search.includes("assistant=open")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    return () => window.removeEventListener("tradesstack:open-assistant", openFromShell);
  }, []);

  return (
    <AssistantShellContext.Provider value={contextValue}>
      {children}
      {!isOpen ? (
        <button
          type="button"
          aria-label="Open TradesStack AI Assistant"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-5 right-5 z-[70] inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary)] text-white shadow-[var(--shadow-overlay)] transition hover:scale-105 hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
        >
          <Bot className="h-5 w-5" />
        </button>
      ) : null}
      <div className={`fixed inset-0 z-[60] lg:pointer-events-none ${isOpen ? "pointer-events-auto" : "pointer-events-none"}`}>
        <div
          aria-hidden="true"
          onClick={() => setIsOpen(false)}
          className={`absolute inset-0 bg-slate-950/20 transition-opacity lg:hidden ${isOpen ? "opacity-100" : "opacity-0"}`}
        />
        <aside
          aria-label="TradesStack AI Assistant"
          className={`pointer-events-auto absolute right-0 top-14 flex h-[calc(100dvh-3.5rem)] w-full max-w-full flex-col border-l border-[var(--border)] bg-white shadow-[-12px_0_32px_rgba(15,23,42,0.12)] transition-transform duration-200 ease-out md:w-[min(520px,28vw)] ${isOpen ? "translate-x-0" : "translate-x-full"}`}
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-3">
            <div className="flex min-w-0 items-center gap-2">
              <Bot className="h-4 w-4 text-[var(--text-secondary)]" strokeWidth={1.8} />
              <span className="truncate text-[14px] font-semibold text-[var(--text-primary)]">TradesStack AI</span>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-muted)]" aria-label="Pin assistant" title="Pin assistant">
                <Pin className="h-4 w-4" strokeWidth={1.8} />
              </button>
              <button type="button" onClick={() => setIsOpen(false)} aria-label="Hide chat" className="inline-flex h-8 w-8 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]">
                <span className="text-xl leading-none">×</span>
              </button>
            </div>
          </div>
          <div className="flex h-12 shrink-0 items-center justify-center border-b border-[var(--border-subtle)] px-3">
            <button type="button" onClick={() => setNewChatKey((key) => key + 1)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-[14px] text-[var(--text-primary)] hover:bg-[var(--surface-muted)]">
              New chat <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button type="button" className="absolute right-3 inline-flex h-8 w-8 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-muted)]" aria-label="Chat actions" title="Chat actions">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            {selectedProject ? (
              <AiChatbotPanel projectSlug={selectedProject.slug} projectName={selectedProject.name} drawer resetKey={newChatKey} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <Bot className="mb-3 h-8 w-8 text-[var(--primary)]" />
                <h2 className="text-base font-semibold text-[var(--text-primary)]">Choose a project to start</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">Open a project page or select a project context for TradesStack AI.</p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </AssistantShellContext.Provider>
  );
}
