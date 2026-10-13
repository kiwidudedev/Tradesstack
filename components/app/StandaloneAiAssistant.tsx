"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import type { OrganizationProject } from "@/lib/projects";
import { AiChatbotPanel } from "./AiChatbotPanel";

export function StandaloneAiAssistant({
  projects,
  initialProjectSlug,
}: {
  projects: OrganizationProject[];
  initialProjectSlug?: string;
}) {
  const firstProjectSlug = initialProjectSlug && projects.some((project) => project.slug === initialProjectSlug)
    ? initialProjectSlug
    : projects[0]?.slug ?? "";
  const [projectSlug, setProjectSlug] = useState(firstProjectSlug);
  const selectedProject = useMemo(
    () => projects.find((project) => project.slug === projectSlug) ?? null,
    [projectSlug, projects],
  );

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-[var(--background)] px-4 pb-8 pt-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary-soft)] text-[var(--primary)]">
              <Sparkles className="h-5 w-5" strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">AI Assistant</h1>
              <p className="text-[13px] text-[var(--text-secondary)]">Ask questions about the TradesStack information you can access.</p>
            </div>
          </div>

          <label className="relative flex min-w-[260px] items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text-secondary)] shadow-sm">
            <span className="shrink-0 font-medium">Project context</span>
            <select
              aria-label="Project context"
              value={projectSlug}
              onChange={(event) => setProjectSlug(event.target.value)}
              className="min-w-0 flex-1 appearance-none bg-transparent pr-5 text-right font-semibold text-[var(--text-primary)] outline-none"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.slug}>{project.name}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
          </label>
        </header>

        {selectedProject ? (
          <AiChatbotPanel projectSlug={selectedProject.slug} projectName={selectedProject.name} />
        ) : (
          <section className="flex min-h-[calc(100vh-220px)] items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 text-center">
            <div>
              <Sparkles className="mx-auto mb-3 h-8 w-8 text-[var(--text-muted)]" strokeWidth={1.5} />
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">No project context available</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">You need access to at least one visible project to use the Assistant.</p>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
