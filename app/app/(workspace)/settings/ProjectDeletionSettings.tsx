"use client";

import { useMemo, useState } from "react";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { interMedium } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

interface ProjectItem {
  id: string;
  name: string;
  slug: string;
}

interface ProjectDeletionSettingsProps {
  organizationId: string;
  projects: ProjectItem[];
}

export function ProjectDeletionSettings({ organizationId, projects }: ProjectDeletionSettingsProps) {
  const [items, setItems] = useState(projects);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const selectedProject = items.find((project) => project.id === selectedProjectId) ?? null;
  const canDelete = Boolean(selectedProject && confirmText.trim().toLowerCase() === "delete");

  const onDeleteProject = async () => {
    if (!supabase || !selectedProject) {
      setError("Unable to delete project right now.");
      return;
    }

    if (!canDelete) {
      setError("Type delete to confirm project deletion.");
      return;
    }

    setIsDeleting(true);
    setError(null);
    setMessage(null);

    const { error: unlinkError } = await supabase
      .from("organization_opportunities")
      .update({
        converted_project_id: null,
        converted_at: null,
        stage: "Quoted",
      })
      .eq("organization_id", organizationId)
      .eq("converted_project_id", selectedProject.id);

    if (unlinkError) {
      setError(unlinkError.message);
      setIsDeleting(false);
      return;
    }

    const { error: deleteError } = await supabase
      .from("organization_projects")
      .delete()
      .eq("organization_id", organizationId)
      .eq("id", selectedProject.id);

    if (deleteError) {
      setError(deleteError.message);
      setIsDeleting(false);
      return;
    }

    setItems((current) => current.filter((project) => project.id !== selectedProject.id));
    setSelectedProjectId("");
    setConfirmText("");
    setMessage(`Deleted "${selectedProject.name}". This project and related data were removed from Supabase.`);
    setIsDeleting(false);
  };

  return (
    <OperationalPanel title="Project Deletion">
      <div className="space-y-4">
        <p className={`${interMedium.className} text-sm font-medium leading-relaxed text-[var(--text-secondary)]`}>
          Deleting a project is permanent. Once deleted, all project information is deleted for good from the system.
        </p>

        {items.length === 0 ? (
          <p className={`${interMedium.className} text-sm font-medium text-[var(--text-secondary)]`}>No projects available to delete.</p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2.5">
              <label className={`${interMedium.className} text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]`}>Select project</label>
              <select
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
                className={`${interMedium.className} h-10 w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text-primary)] outline-none`}
              >
                <option value="">Choose a project to delete</option>
                {items.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedProject ? (
              <div className="rounded-[12px] border border-[var(--error-light)] bg-[var(--error-light)] p-3">
                <p className={`${interMedium.className} text-sm font-semibold text-[var(--error)]`}>
                  You are deleting: {selectedProject.name}
                </p>
                <p className={`${interMedium.className} mt-1 text-sm font-medium text-[var(--error)]`}>
                  This action cannot be undone. Type <span className="font-semibold">delete</span> to confirm.
                </p>
                <Input
                  value={confirmText}
                  onChange={(event) => setConfirmText(event.target.value)}
                  placeholder='Type "delete" to confirm'
                  className={`${interMedium.className} mt-3 h-10 rounded-[8px] border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)]`}
                />
              </div>
            ) : null}

            <Button
              type="button"
              variant="destructive"
              onClick={onDeleteProject}
              disabled={!canDelete || isDeleting}
              className={`${interMedium.className} inline-flex rounded-full px-[0.7rem] py-[0.55rem] text-[15px] font-medium shadow-none`}
            >
              {isDeleting ? "Deleting..." : "Delete Project"}
            </Button>
          </div>
        )}

        {error ? (
          <p className={`${interMedium.className} rounded-[6px] border border-[var(--error-light)] bg-[var(--error-light)] px-3 py-2 text-sm font-medium text-[var(--error)]`}>
            {error}
          </p>
        ) : null}

        {message ? (
          <p className={`${interMedium.className} rounded-[6px] border border-[var(--success-light)] bg-[var(--success-light)] px-3 py-2 text-sm font-medium text-[var(--success)]`}>
            {message}
          </p>
        ) : null}
      </div>
    </OperationalPanel>
  );
}
