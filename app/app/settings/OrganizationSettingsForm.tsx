"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { interMedium } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

interface OrganizationSettingsFormProps {
  organizationId: string;
  initialName: string;
  initialLogoPath: string | null;
  initialLogoUrl: string | null;
  canEdit: boolean;
}

function toSettingsErrorMessage(error: {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}) {
  const parts = [error.message];
  if (error.code) {
    parts.push(`code=${error.code}`);
  }
  if (error.details) {
    parts.push(`details=${error.details}`);
  }
  if (error.hint) {
    parts.push(`hint=${error.hint}`);
  }
  return parts.join(" | ");
}

function buildLogoPath(organizationId: string, fileName: string) {
  const ext = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() ?? "png" : "png";
  return `${organizationId}/logo-${crypto.randomUUID()}.${ext}`;
}

export function OrganizationSettingsForm(props: OrganizationSettingsFormProps) {
  const [name, setName] = useState(props.initialName);
  const [logoPath, setLogoPath] = useState<string | null>(props.initialLogoPath);
  const [logoUrl, setLogoUrl] = useState<string | null>(props.initialLogoUrl);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const onSaveName = async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Organization name is required.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    const { error: updateError } = await supabase
      .rpc("update_organization_settings", {
        p_organization_id: props.organizationId,
        p_name: trimmedName,
        p_logo_path: null,
      });

    if (updateError) {
      setError(toSettingsErrorMessage(updateError));
    } else {
      setMessage("Organization settings saved.");
    }

    setIsSaving(false);
  };

  const onUploadLogo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Logo must be under 10MB.");
      return;
    }

    setIsUploading(true);
    setError(null);
    setMessage(null);

    const nextPath = buildLogoPath(props.organizationId, file.name);
    const { error: uploadError } = await supabase.storage.from("organization-logos").upload(nextPath, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: "3600",
    });

    if (uploadError) {
      setError(toSettingsErrorMessage(uploadError));
      setIsUploading(false);
      return;
    }

    const { error: updateError } = await supabase
      .rpc("update_organization_settings", {
        p_organization_id: props.organizationId,
        p_name: null,
        p_logo_path: nextPath,
      });

    if (updateError) {
      setError(toSettingsErrorMessage(updateError));
      setIsUploading(false);
      return;
    }

    if (logoPath && logoPath !== nextPath) {
      await supabase.storage.from("organization-logos").remove([logoPath]);
    }

    const { data } = supabase.storage.from("organization-logos").getPublicUrl(nextPath);
    setLogoPath(nextPath);
    setLogoUrl(data.publicUrl);
    setMessage("Logo uploaded.");
    setIsUploading(false);
  };

  return (
    <Card className="border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
      <CardHeader className="pb-3 pt-6">
        <CardTitle className="text-xl font-semibold tracking-[-0.02em] text-[#0F172A]">Organization Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className={`${interMedium.className} text-sm font-medium text-[#1d2433]`}>Organization name</label>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={!props.canEdit || isSaving}
            className={`${interMedium.className} h-11 rounded-[6px] border-[#cdd4e2] bg-white text-[#1d2433]`}
          />
        </div>

        <div className="space-y-2">
          <label className={`${interMedium.className} text-sm font-medium text-[#1d2433]`}>Company Logo (recommended: 1200 x 400 px)</label>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[6px] border border-[#d8e0ec] bg-[#f8fafc]">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Organization logo" className="h-full w-full object-contain" />
              ) : (
                <span className={`${interMedium.className} text-[11px] text-[#72839d]`}>No logo</span>
              )}
            </div>
            <label className="inline-flex">
              <input
                type="file"
                accept="image/*"
                onChange={onUploadLogo}
                disabled={!props.canEdit || isUploading}
                className="hidden"
              />
              <span className={`${interMedium.className} inline-flex h-10 cursor-pointer items-center rounded-[6px] border border-[#d3dbe8] bg-white px-4 text-sm font-medium text-[#1d2433] hover:bg-[#f8fafc]`}>
                {isUploading ? "Uploading..." : "Upload logo"}
              </span>
            </label>
          </div>
        </div>

        {!props.canEdit ? (
          <p className={`${interMedium.className} text-sm text-[#5f6f89]`}>You do not have permission to update organization settings.</p>
        ) : null}

        {error ? (
          <p className={`${interMedium.className} rounded-[6px] border border-red-300/60 bg-red-50 px-3 py-2 text-sm font-medium text-red-700`}>{error}</p>
        ) : null}

        {message ? (
          <p className={`${interMedium.className} rounded-[6px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700`}>{message}</p>
        ) : null}

        <div>
          <Button
            type="button"
            onClick={onSaveName}
            disabled={!props.canEdit || isSaving || isUploading}
            className={`${interMedium.className} h-10 rounded-[6px] bg-[#F74917] px-4 text-sm font-medium text-white hover:bg-[#e63f10]`}
          >
            {isSaving ? "Saving..." : "Save settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
