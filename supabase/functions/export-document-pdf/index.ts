/**
 * Deploy:
 *   supabase functions deploy export-document-pdf
 * Hosted secrets:
 *   supabase secrets set SUPABASE_URL=...
 *   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import {
  PDFDocument,
  StandardFonts,
  rgb,
} from "https://esm.sh/pdf-lib@1.17.1";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TYPE_CONFIG: Record<
  "quote" | "invoice" | "po" | "variation",
  { title: string; pathPrefix: string }
> = {
  quote: { title: "Quote", pathPrefix: "quotes" },
  invoice: { title: "Invoice", pathPrefix: "invoices" },
  po: { title: "Purchase Order", pathPrefix: "pos" },
  variation: { title: "Variation", pathPrefix: "variations" },
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";

  if (!token) {
    return new Response(JSON.stringify({ error: "Missing bearer token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const projectUrl = Deno.env.get("PROJECT_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? "";
  if (!projectUrl || !supabaseAnonKey || !serviceRoleKey) {
    return new Response(
      JSON.stringify({
        error:
          "Missing Supabase environment variables (PROJECT_URL, SUPABASE_ANON_KEY, SERVICE_ROLE_KEY)",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const supabase = createClient(projectUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const supabaseAdmin = createClient(projectUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(
    token,
  );
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload: { documentId?: string; type?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const documentId = payload.documentId ?? "";
  if (!UUID_REGEX.test(documentId)) {
    return new Response(JSON.stringify({ error: "Invalid documentId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const type = payload.type as keyof typeof TYPE_CONFIG;
  if (!type || !(type in TYPE_CONFIG)) {
    return new Response(JSON.stringify({ error: "Invalid document type" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: document, error: documentError } = await supabaseAdmin
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .eq("type", type)
    .maybeSingle();

  if (documentError) {
    return new Response(
      JSON.stringify({
        error: "Failed to load document",
        details: documentError.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (!document) {
    return new Response(JSON.stringify({ error: "Document not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: items, error: itemsError } = await supabaseAdmin
    .from("document_items")
    .select("*")
    .eq("document_id", documentId)
    .order("created_at", { ascending: true });

  if (itemsError) {
    return new Response(
      JSON.stringify({
        error: "Failed to load document items",
        details: itemsError.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const itemsList = items ?? [];

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const A4_WIDTH = 595.28;
  const A4_HEIGHT = 841.89;
  const NAVY = rgb(0.03, 0.17, 0.36);
  const ORANGE = rgb(0.97, 0.28, 0.09);
  const TEXT = rgb(0.08, 0.1, 0.15);
  const MUTED = rgb(0.35, 0.38, 0.44);
  const MARGIN_X = 48;
  const HEADER_HEIGHT = 72;
  const ACCENT_HEIGHT = 4;
  const LINE_HEIGHT = 14;

  const formatValue = (value: unknown, fallback = "—") => {
    if (value === null || value === undefined) return fallback;
    if (typeof value === "string" && value.trim() === "") return fallback;
    return String(value);
  };

  const wrapText = (
    text: string,
    maxWidth: number,
    fontSize: number,
    fontRef: typeof font,
  ) => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      const width = fontRef.widthOfTextAtSize(test, fontSize);
      if (width <= maxWidth) {
        current = test;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  const { title, pathPrefix } = TYPE_CONFIG[type];

  let page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  let y = A4_HEIGHT;

  const drawHeader = () => {
    page.drawRectangle({
      x: 0,
      y: A4_HEIGHT - HEADER_HEIGHT,
      width: A4_WIDTH,
      height: HEADER_HEIGHT,
      color: NAVY,
    });
    page.drawRectangle({
      x: 0,
      y: A4_HEIGHT - HEADER_HEIGHT - ACCENT_HEIGHT,
      width: A4_WIDTH,
      height: ACCENT_HEIGHT,
      color: ORANGE,
    });
    page.drawText(title, {
      x: MARGIN_X,
      y: A4_HEIGHT - 44,
      size: 20,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
  };

  const startNewPage = () => {
    page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    y = A4_HEIGHT;
    drawHeader();
    y = A4_HEIGHT - HEADER_HEIGHT - ACCENT_HEIGHT - 24;
  };

  drawHeader();
  y = A4_HEIGHT - HEADER_HEIGHT - ACCENT_HEIGHT - 24;

  const headerFields = [
    ["Variation No", formatValue(document?.variation_no)],
    ["Date", formatValue(document?.date ?? document?.issue_date)],
    ["Issued To", formatValue(document?.issued_to ?? document?.client_name)],
    ["Project", formatValue(document?.project_name)],
  ];

  const labelSize = 10;
  const valueSize = 12;
  const fieldGap = 12;

  for (const [label, value] of headerFields) {
    page.drawText(label, {
      x: MARGIN_X,
      y,
      size: labelSize,
      font: fontBold,
      color: MUTED,
    });
    page.drawText(value, {
      x: MARGIN_X,
      y: y - 16,
      size: valueSize,
      font,
      color: TEXT,
    });
    y -= 16 + valueSize + fieldGap;
  }

  y -= 8;

  const tableTop = y;
  const colDesc = MARGIN_X;
  const colPrice = A4_WIDTH - MARGIN_X - 160;
  const colTotal = A4_WIDTH - MARGIN_X - 72;

  page.drawText("DESCRIPTION", {
    x: colDesc,
    y: tableTop,
    size: 10,
    font: fontBold,
    color: MUTED,
  });
  page.drawText("PRICE", {
    x: colPrice,
    y: tableTop,
    size: 10,
    font: fontBold,
    color: MUTED,
  });
  page.drawText("TOTAL", {
    x: colTotal,
    y: tableTop,
    size: 10,
    font: fontBold,
    color: MUTED,
  });

  y = tableTop - 14;

  for (const item of itemsList) {
    const description = formatValue(item.description ?? item.title ?? "—");
    const unitPriceRaw = item.unit_price ?? item.price ?? item.rate ?? null;
    const quantityRaw = item.quantity ?? item.qty ?? 1;
    const unitPrice = unitPriceRaw ? Number(unitPriceRaw) : 0;
    const quantity = quantityRaw ? Number(quantityRaw) : 1;
    const totalRaw = item.total ?? item.amount ?? unitPrice * quantity;

    const descLines = wrapText(
      description,
      colPrice - colDesc - 16,
      11,
      font,
    );
    const rowHeight = Math.max(descLines.length, 1) * LINE_HEIGHT + 6;

    if (y - rowHeight < 80) {
      startNewPage();
      y -= 6;
    }

    let lineY = y;
    for (const line of descLines) {
      page.drawText(line, {
        x: colDesc,
        y: lineY,
        size: 11,
        font,
        color: TEXT,
      });
      lineY -= LINE_HEIGHT;
    }

    const priceText = unitPrice ? `$${unitPrice.toFixed(2)}` : "—";
    const totalText = totalRaw ? `$${Number(totalRaw).toFixed(2)}` : "—";

    page.drawText(priceText, {
      x: colPrice,
      y: y,
      size: 11,
      font,
      color: TEXT,
    });
    page.drawText(totalText, {
      x: colTotal,
      y: y,
      size: 11,
      font,
      color: TEXT,
    });

    y -= rowHeight;
  }

  const pdfBytes = await pdfDoc.save();
  const path = `${pathPrefix}/${documentId}.pdf`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from("pdfs")
    .upload(path, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    return new Response(
      JSON.stringify({
        error: "Failed to upload PDF",
        details: uploadError.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const { data: signedData, error: signedError } = await supabaseAdmin.storage
    .from("pdfs")
    .createSignedUrl(path, 60 * 60);

  if (signedError || !signedData?.signedUrl) {
    return new Response(
      JSON.stringify({
        error: "Failed to create signed URL",
        details: signedError?.message ?? "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return new Response(
    JSON.stringify({
      path,
      signedUrl: signedData.signedUrl,
      sizeBytes: pdfBytes.length,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
});
