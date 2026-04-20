import { NextResponse } from "next/server";
import { createOrganizationProjectForCurrentUser } from "@/lib/project-creation-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface CreateProjectRequestBody {
  name?: string;
  stage?: string;
  location?: string;
  clientId?: string | null;
  newClient?: {
    contactName?: string;
    companyName?: string;
    email?: string;
    phone?: string;
  } | null;
}

function toOptionalTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: CreateProjectRequestBody | null = null;
  try {
    body = (await request.json()) as CreateProjectRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Project name is required." }, { status: 400 });
  }

  const selectedClientId = toOptionalTrimmedString(body?.clientId);
  const newClient = body?.newClient ?? null;
  const shouldCreateNewClient = !selectedClientId && Boolean(newClient);

  let createdClientId: string | null = null;

  try {
    if (shouldCreateNewClient) {
      const {
        data: member,
        error: memberError,
      } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (memberError) {
        throw new Error(memberError.message);
      }

      if (!member?.organization_id) {
        throw new Error("Could not find or create organization access for this account.");
      }

      const contactName = toOptionalTrimmedString(newClient?.contactName);
      const companyName = toOptionalTrimmedString(newClient?.companyName);

      if (!contactName) {
        return NextResponse.json({ error: "Contact name is required." }, { status: 400 });
      }

      if (!companyName) {
        return NextResponse.json({ error: "Company name is required." }, { status: 400 });
      }

      const createdClientResult = await supabase
        .from("organization_clients")
        .insert({
          organization_id: member.organization_id,
          created_by: user.id,
          name: contactName,
          company_name: companyName,
          email: toOptionalTrimmedString(newClient?.email),
          phone: toOptionalTrimmedString(newClient?.phone),
        })
        .select("id")
        .single();

      if (createdClientResult.error) {
        throw new Error(createdClientResult.error.message);
      }

      createdClientId = createdClientResult.data.id;
    }

    const createdProject = await createOrganizationProjectForCurrentUser({
      name,
      clientId: createdClientId ?? selectedClientId,
      stage:
        body?.stage === "Pricing" || body?.stage === "Construction" || body?.stage === "Completion"
          ? body.stage
          : "Pricing",
      location: toOptionalTrimmedString(body?.location),
      sourceOpportunityId: null,
    });

    return NextResponse.json({ projectSlug: createdProject.slug });
  } catch (error) {
    if (createdClientId) {
      await supabase.from("organization_clients").delete().eq("id", createdClientId);
    }

    const message = error instanceof Error ? error.message : "Unable to create project.";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
