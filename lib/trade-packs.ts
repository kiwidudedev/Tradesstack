import { TRADE_PACK_TRADES } from "@/lib/trade-pack-builder";
import { PROJECT_DRAWING_SETS_BUCKET } from "@/lib/drawing-sets";
import type { Database } from "@/lib/supabase/types";

type DrawingSetLike = Pick<
  Database["public"]["Tables"]["project_drawing_sets"]["Row"],
  "file_name" | "storage_path"
>;

function escapeRegexValue(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function toSourceDocumentNameFromGeneratedPackName(fileName: string, tradeLabel: string): string | null {
  const trimmed = fileName.trim().replace(/\.pdf$/i, "");
  if (!trimmed) {
    return null;
  }

  const exactSuffixPattern = new RegExp(`\\s*-\\s*${escapeRegexValue(tradeLabel)}\\s*TRADE PACK$`, "i");
  if (exactSuffixPattern.test(trimmed)) {
    const sourceName = trimmed.replace(exactSuffixPattern, "").trim();
    return sourceName || null;
  }

  const genericSuffixPattern = /\s*-\s*.+\s+TRADE PACK$/i;
  if (genericSuffixPattern.test(trimmed)) {
    const sourceName = trimmed.replace(genericSuffixPattern, "").trim();
    return sourceName || null;
  }

  return null;
}

export function isGeneratedTradePackDrawingSet(drawingSet: DrawingSetLike): boolean {
  const fileName = drawingSet.file_name.toUpperCase();
  const storagePath = drawingSet.storage_path.toUpperCase();
  return fileName.includes("TRADE PACK") || storagePath.includes("-TRADE-PACK.PDF");
}

export function getGeneratedTradePackTradeLabel(drawingSet: DrawingSetLike): string {
  const upperFileName = drawingSet.file_name.toUpperCase();
  const lowerStoragePath = drawingSet.storage_path.toLowerCase();

  const matchedTrade = TRADE_PACK_TRADES.find(
    (trade) =>
      upperFileName.includes(`${trade.label.toUpperCase()} TRADE PACK`) ||
      lowerStoragePath.includes(`-${trade.slug}-trade-pack.pdf`) ||
      lowerStoragePath.includes(`-${trade.slug}-trade-pack`)
  );

  if (matchedTrade) {
    return matchedTrade.label;
  }

  const fallbackMatch = drawingSet.file_name.match(/-\s*(.+?)\s*TRADE PACK$/i);
  if (fallbackMatch?.[1]) {
    return fallbackMatch[1].trim();
  }

  return "Trade Pack";
}

export function getGeneratedTradePackTradeId(drawingSet: DrawingSetLike): string | null {
  const upperFileName = drawingSet.file_name.toUpperCase();
  const lowerStoragePath = drawingSet.storage_path.toLowerCase();

  const matchedTrade = TRADE_PACK_TRADES.find(
    (trade) =>
      upperFileName.includes(`${trade.label.toUpperCase()} TRADE PACK`) ||
      lowerStoragePath.includes(`-${trade.slug}-trade-pack.pdf`) ||
      lowerStoragePath.includes(`-${trade.slug}-trade-pack`)
  );

  return matchedTrade?.id ?? null;
}

export function toTradePackPdfUrl(storagePath: string): string {
  return `supabase://${PROJECT_DRAWING_SETS_BUCKET}/${storagePath}`;
}
