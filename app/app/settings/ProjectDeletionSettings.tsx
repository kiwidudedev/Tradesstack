"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card className="rounded-[22px] border border-[#D9DEE5] bg-white shadow-none">
      <CardHeader className="pb-4 pt-4">
        <CardTitle className="text-[19px] font-semibold leading-[1.1] tracking-[-0.02em] text-[#1d2433]">Project Deletion</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className={`${interMedium.className} text-sm font-medium leading-relaxed text-[#5F7390]`}>
          Deleting a project is permanent. Once deleted, all project information is deleted for good from the system.
        </p>

        {items.length === 0 ? (
          <p className={`${interMedium.className} text-sm font-medium text-[#5f6f89]`}>No projects available to delete.</p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2.5">
              <label className={`${interMedium.className} text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]`}>Select project</label>
              <select
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
                className={`${interMedium.className} h-10 w-full rounded-[8px] border border-[#D9DEE5] bg-white px-3 text-[13px] text-[#1d2433] outline-none`}
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
              <div className="rounded-[12px] border border-[#F4C7C7] bg-[#FFF5F5] p-3">
                <p className={`${interMedium.className} text-sm font-semibold text-[#B42318]`}>
                  You are deleting: {selectedProject.name}
                </p>
                <p className={`${interMedium.className} mt-1 text-sm font-medium text-[#7A2633]`}>
                  This action cannot be undone. Type <span className="font-semibold">delete</span> to confirm.
                </p>
                <Input
                  value={confirmText}
                  onChange={(event) => setConfirmText(event.target.value)}
                  placeholder='Type "delete" to confirm'
                  className={`${interMedium.className} mt-3 h-10 rounded-[8px] border-[#EAB8B8] bg-white text-[#1d2433]`}
                />
              </div>
            ) : null}

            <Button
              type="button"
              onClick={onDeleteProject}
              disabled={!canDelete || isDeleting}
              className={`${interMedium.className} inline-flex rounded-full border border-[#B42318] bg-[#B42318] px-[0.7rem] py-[0.55rem] text-[15px] font-medium text-white shadow-none hover:bg-[#B42318] hover:opacity-90 disabled:bg-[#d98d88]`}
            >
              {isDeleting ? "Deleting..." : "Delete Project"}
            </Button>
          </div>
        )}

        {error ? (
          <p className={`${interMedium.className} rounded-[6px] border border-red-300/60 bg-red-50 px-3 py-2 text-sm font-medium text-red-700`}>
            {error}
          </p>
        ) : null}

        {message ? (
          <p className={`${interMedium.className} rounded-[6px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700`}>
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
