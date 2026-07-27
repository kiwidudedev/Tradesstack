import { NextResponse } from "next/server";
import type { PricingWorksheetOwnerContextValue } from "@/lib/pricing-worksheet-owner";
import {
  IMMUTABLE_VARIATION_MESSAGE,
  resolveWorksheetVariationPublishContextForCurrentUser,
} from "@/lib/commercial-items/worksheet-variation-publish-context-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface VariationPublishContextRequestBody {
  owner?: PricingWorksheetOwnerContextValue;
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

  let body: VariationPublishContextRequestBody | null = null;
  try {
    body = (await request.json()) as VariationPublishContextRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  if (!body?.owner || typeof body.owner !== "object") {
    return NextResponse.json({ error: "owner is required." }, { status: 400 });
  }

  try {
    const context = await resolveWorksheetVariationPublishContextForCurrentUser({
      owner: body.owner,
    });

    return NextResponse.json({ context });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare variation publishing.";
    const status =
      message === "Unauthorized"
        ? 401
        : message === "Project not found." || message === "Variation not found."
        ? 404
        : message === IMMUTABLE_VARIATION_MESSAGE
        ? 409
        : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
