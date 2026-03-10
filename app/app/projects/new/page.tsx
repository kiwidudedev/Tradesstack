"use client";

import Link from "next/link";
import { Inter } from "next/font/google";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  MAX_PROJECT_IMAGE_UPLOAD_SIZE_BYTES,
  PROJECT_IMAGES_BUCKET,
  resolveUniqueProjectSlug,
  toProjectImageStoragePath,
  toProjectSlug,
} from "@/lib/projects";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const interMedium = Inter({
  subsets: ["latin"],
  weight: ["500"],
  display: "swap",
});

export default function CreateProjectPage() {
  const router = useRouter();
  const { session, isLoading: isAuthLoading } = useAuth();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [projectImageFile, setProjectImageFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isAuthLoading) {
      setError("Loading your account. Please try again in a moment.");
      return;
    }

    if (!session) {
      setError("You are not signed in. Please sign in again.");
      return;
    }

    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Project name is required.");
      return;
    }

    if (projectImageFile) {
      const isImage = projectImageFile.type.startsWith("image/");
      if (!isImage) {
        setError("Project photo must be an image file.");
        return;
      }

      if (projectImageFile.size > MAX_PROJECT_IMAGE_UPLOAD_SIZE_BYTES) {
        setError("Project photo must be 10MB or smaller.");
        return;
      }
    }

    setError(null);
    setIsSubmitting(true);

    try {
      let organizationId = session.organizationId ?? null;
      if (!organizationId) {
        const { data: ensuredOrganizationId, error: ensureOrganizationError } = await supabase.rpc(
          "ensure_organization_membership"
        );

        if (!ensureOrganizationError) {
          organizationId = ensuredOrganizationId ?? null;
        } else {
          const { data: memberRow } = await supabase
            .from("organization_members")
            .select("organization_id")
            .eq("user_id", session.id)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

          organizationId = memberRow?.organization_id ?? null;

          if (!organizationId) {
            const normalizedError = ensureOrganizationError.message.toLowerCase();
            if (normalizedError.includes("ensure_organization_membership")) {
              setError("Database migration required. Run the latest Supabase migrations and try again.");
            } else {
              setError(ensureOrganizationError.message);
            }
            return;
          }
        }
      }

      if (!organizationId) {
        setError("Could not find or create organization access for this account.");
        return;
      }

      const baseSlug = toProjectSlug(trimmedName);
      const { data: existingProjectRows, error: existingProjectsError } = await supabase
        .from("organization_projects")
        .select("slug")
        .eq("organization_id", organizationId)
        .like("slug", `${baseSlug}%`);

      if (existingProjectsError) {
        setError(existingProjectsError.message);
        return;
      }

      const slug = resolveUniqueProjectSlug(
        baseSlug,
        (existingProjectRows ?? []).map((project) => project.slug)
      );

      const projectId = crypto.randomUUID();
      let coverImageUrl: string | null = null;
      let uploadedImagePath: string | null = null;

      if (projectImageFile) {
        const storagePath = toProjectImageStoragePath({
          organizationId,
          projectId,
          fileName: projectImageFile.name,
        });
        uploadedImagePath = storagePath;

        const { error: uploadError } = await supabase.storage
          .from(PROJECT_IMAGES_BUCKET)
          .upload(storagePath, projectImageFile, {
            cacheControl: "3600",
            upsert: false,
            contentType: projectImageFile.type || undefined,
          });

        if (uploadError) {
          const normalizedMessage = uploadError.message.toLowerCase();
          if (normalizedMessage.includes("bucket")) {
            setError("Project image bucket is not configured. Create a `project-images` bucket in Supabase Storage.");
          } else {
            setError(uploadError.message);
          }
          return;
        }

        const { data: publicUrlData } = supabase.storage.from(PROJECT_IMAGES_BUCKET).getPublicUrl(storagePath);
        coverImageUrl = publicUrlData.publicUrl || null;
      }

      const { data, error: createProjectError } = await supabase
        .from("organization_projects")
        .insert({
          id: projectId,
          organization_id: organizationId,
          created_by: session.id,
          name: trimmedName,
          slug,
          location: location.trim() || "Unspecified",
          cover_image_url: coverImageUrl,
        })
        .select("slug")
        .single();

      if (createProjectError) {
        if (uploadedImagePath) {
          await supabase.storage.from(PROJECT_IMAGES_BUCKET).remove([uploadedImagePath]);
        }
        setError(createProjectError.message);
        return;
      }

      router.push(`/app/projects/${data.slug}/dashboard`);
      router.refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create project.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="space-y-8 pb-8">
      <Card className="relative overflow-hidden border-[#E6EAF0] bg-white shadow-none">
        <CardHeader className="pb-4 pt-7">
          <Link
            href="/app/dashboard"
            className={`${interMedium.className} mb-4 inline-flex w-fit items-center gap-2 rounded-[10px] border border-[#d5dbe6] bg-white px-4 py-2 text-sm font-medium text-[#384055] hover:bg-[#f8faff]`}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Main Dashboard
          </Link>
          <CardTitle className="text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">Create Project</CardTitle>
          <p className={`${interMedium.className} max-w-3xl text-base font-medium leading-relaxed text-[#4d5b74]`}>
            Set up a new project dashboard for your organization. This creates a dedicated workspace for Drawing
            Intelligence, Scope Builder, Change Detection, and AI Chatbot.
          </p>
        </CardHeader>
        <CardContent className="max-w-2xl pb-8">
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <label htmlFor="projectName" className={`${interMedium.className} block text-sm font-medium text-[#1d2433]`}>
                Project name
              </label>
              <Input
                id="projectName"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Smith Renovation"
                className={`${interMedium.className} h-11 rounded-[10px] border-[#cdd4e2] bg-white text-[#1d2433]`}
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="projectLocation" className={`${interMedium.className} block text-sm font-medium text-[#1d2433]`}>
                Location
              </label>
              <Input
                id="projectLocation"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Auckland"
                className={`${interMedium.className} h-11 rounded-[10px] border-[#cdd4e2] bg-white text-[#1d2433]`}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="projectImage" className={`${interMedium.className} block text-sm font-medium text-[#1d2433]`}>
                Project photo (optional)
              </label>
              <Input
                id="projectImage"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null;
                  setProjectImageFile(nextFile);
                }}
                className={`${interMedium.className} h-11 rounded-[10px] border-[#cdd4e2] bg-white text-sm file:mr-4 file:rounded-[8px] file:border-0 file:bg-[#F1F4F8] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[#0F172A]`}
              />
              <p className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>
                Supports JPG, PNG, WEBP. Max size 10MB.
              </p>
            </div>

            {error ? (
              <p className={`${interMedium.className} rounded-[10px] border border-red-300/60 bg-red-50 px-3 py-2 text-sm font-medium text-red-700`}>{error}</p>
            ) : null}

            <Button
              type="submit"
              disabled={isSubmitting || isAuthLoading}
              className={`${interMedium.className} h-10 rounded-[10px] bg-[#F74917] px-[18px] text-sm font-medium text-white hover:bg-[#e63f10]`}
            >
              {isSubmitting ? "Creating project..." : isAuthLoading ? "Loading account..." : "Create Project"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
