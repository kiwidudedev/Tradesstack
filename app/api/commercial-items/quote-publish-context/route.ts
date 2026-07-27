import { NextResponse } from "next/server";
import { resolveWorksheetQuotePublishContextForCurrentUser } from "@/lib/commercial-items/worksheet-quote-publish-context-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface QuotePublishContextRequestBody {
  organizationId?: string;
  opportunityId?: string;
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

  let body: QuotePublishContextRequestBody | null = null;
  try {
    body = (await request.json()) as QuotePublishContextRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const organizationId = typeof body?.organizationId === "string" ? body.organizationId.trim() : "";
  const opportunityId = typeof body?.opportunityId === "string" ? body.opportunityId.trim() : "";

  if (!organizationId || !opportunityId) {
    return NextResponse.json({ error: "organizationId and opportunityId are required." }, { status: 400 });
  }

  try {
    const context = await resolveWorksheetQuotePublishContextForCurrentUser({
      organizationId,
      opportunityId,
    });

    return NextResponse.json({ context });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare quote publishing.";
    const status =
      message === "Unauthorized"
        ? 401
        : message === "Opportunity not found."
        ? 404
        : message === "This worksheet is not linked to a quote workspace yet."
        ? 409
        : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
