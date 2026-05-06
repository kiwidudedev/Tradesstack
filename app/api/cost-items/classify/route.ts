import { NextResponse } from "next/server";
import { classifyLineItem } from "@/lib/cost-items/classification/classifyLineItem";

export const runtime = "nodejs";

type ClassifyRequestBody = {
  description?: unknown;
  descriptions?: unknown;
};

function toDescriptionList(body: ClassifyRequestBody): string[] {
  if (typeof body.description === "string" && body.description.trim().length > 0) {
    return [body.description.trim()];
  }

  if (Array.isArray(body.descriptions)) {
    return body.descriptions
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  return [];
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/cost-items/classify",
    method: "POST",
    body: {
      description: "1980x810 hollowcore door",
    },
  });
}

export async function POST(request: Request) {
  let body: ClassifyRequestBody;

  try {
    body = (await request.json()) as ClassifyRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const descriptions = toDescriptionList(body);
  if (descriptions.length === 0) {
    return NextResponse.json(
      { error: "Provide `description` as a string or `descriptions` as a non-empty string array." },
      { status: 400 }
    );
  }

  const results = descriptions.map((description) => ({
    description,
    classification: classifyLineItem(description),
  }));

  return NextResponse.json({
    ok: true,
    count: results.length,
    results,
  });
}
