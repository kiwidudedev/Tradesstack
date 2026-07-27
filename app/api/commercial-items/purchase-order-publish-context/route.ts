import { NextResponse } from "next/server";
import type { PricingWorksheetOwnerContextValue } from "@/lib/pricing-worksheet-owner";
import { resolveWorksheetPurchaseOrderPublishContextForCurrentUser } from "@/lib/commercial-items/worksheet-purchase-order-publish-context-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface PurchaseOrderPublishContextRequestBody {
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

  let body: PurchaseOrderPublishContextRequestBody | null = null;
  try {
    body = (await request.json()) as PurchaseOrderPublishContextRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  if (!body?.owner || typeof body.owner !== "object") {
    return NextResponse.json({ error: "owner is required." }, { status: 400 });
  }

  try {
    const context = await resolveWorksheetPurchaseOrderPublishContextForCurrentUser({
      owner: body.owner,
    });

    return NextResponse.json({ context });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare purchase order publishing.";
    const status =
      message === "Unauthorized"
        ? 401
        : message === "Opportunity not found." || message === "Project not found." || message === "Converted project not found."
        ? 404
        : message === "Purchase Orders are available after this opportunity is converted to a project."
        ? 409
        : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
