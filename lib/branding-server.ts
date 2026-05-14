import "server-only";
import { cache } from "react";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface OrganizationBranding {
  platformColor: string | null;
  actionColor: string | null;
}

/**
 * Reads the current organization's saved branding colours.
 * Reuses the existing `brand_primary_color` / `brand_accent_color` columns
 * already saved by the Organization Settings form — no new write paths.
 *
 * Semantic role:
 *   platformColor (brand_primary_color) → topbar / shell identity
 *   actionColor   (brand_accent_color)  → primary CTA / action buttons
 */
export const getCurrentOrganizationBranding = cache(
  async (): Promise<OrganizationBranding> => {
    const member = await getCurrentOrganizationMember();
    if (!member) {
      return { platformColor: null, actionColor: null };
    }

    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from("organizations")
      .select("brand_primary_color, brand_accent_color")
      .eq("id", member.organization_id)
      .maybeSingle();

    return {
      platformColor: (data?.brand_primary_color ?? "").trim() || null,
      actionColor: (data?.brand_accent_color ?? "").trim() || null,
    };
  }
);
