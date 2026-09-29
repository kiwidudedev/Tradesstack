import { NextResponse } from "next/server";
import { getCurrentOrganizationMember, getOrganizationProjectBySlugForCurrentUser } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { enforceRouteGuard } from "@/lib/security/abuse-guard";

export const runtime = "nodejs";

type PlanTier = "starter" | "pro";

interface AiChatConversationRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_message_at: string;
}

interface AiChatUsageQueryClient {
  from: (table: "ai_chat_usage") => {
    select: (columns: string, options: { count: "exact"; head: true }) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          gte: (
            column: string,
            value: string
          ) => Promise<{ count: number | null; error: { message: string } | null }>;
        };
      };
    };
  };
}

function getMonthStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

function getPlanTierForUser(userId: string): PlanTier {
  const proUserIds = (process.env.AI_CHAT_PRO_USER_IDS || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (proUserIds.includes(userId)) {
    return "pro";
  }

  return "starter";
}

function getMonthlyMessageLimit(planTier: PlanTier) {
  return planTier === "pro" ? 200 : 50;
}

function parseCursor(cursorRaw: string | null): { lastMessageAt: string; id: string } | null {
  if (!cursorRaw) {
    return null;
  }
  const [lastMessageAt, id] = cursorRaw.split("|");
  if (!lastMessageAt || !id) {
    return null;
  }
  if (!Number.isFinite(Date.parse(lastMessageAt))) {
    return null;
  }
  return { lastMessageAt, id };
}

function buildCursor(lastMessageAt: string, id: string) {
  return `${lastMessageAt}|${id}`;
}

export async function GET(request: Request) {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const projectSlug = url.searchParams.get("projectSlug")?.trim() || "";
  if (!projectSlug) {
    return NextResponse.json({ error: "Missing project slug." }, { status: 400 });
  }

  const project = await getOrganizationProjectBySlugForCurrentUser(projectSlug);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const guard = await enforceRouteGuard({
    routeKey: "chat-conversations",
    request,
    userId: member.user_id,
    userPerMinute: 120,
    ipPerMinute: 240,
    concurrentPerUser: 0,
  });
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const parsedLimit = Number(url.searchParams.get("limit") || "30");
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(Math.floor(parsedLimit), 1), 100) : 30;
  const cursor = parseCursor(url.searchParams.get("cursor"));

  const supabase = await createServerSupabaseClient();
  // The legacy chat tables are not in generated Database types; keep this dynamic boundary narrow.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  let conversationsQuery = db
    .from("ai_chat_conversations")
    .select("id, title, created_at, updated_at, last_message_at")
    .eq("user_id", member.user_id)
    .eq("project_slug", projectSlug)
    .is("archived_at", null)
    .order("last_message_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    conversationsQuery = conversationsQuery.or(
      `last_message_at.lt.${cursor.lastMessageAt},and(last_message_at.eq.${cursor.lastMessageAt},id.lt.${cursor.id})`
    );
  }

  const conversationsResult = await conversationsQuery;

  if (conversationsResult.error) {
    console.error("[chat-conversations] failed to load", conversationsResult.error);
    await guard.release();
    return NextResponse.json({ error: "Failed to load chat conversations." }, { status: 500 });
  }

  const conversationsRaw: AiChatConversationRow[] = Array.isArray(conversationsResult.data)
    ? (conversationsResult.data as AiChatConversationRow[])
    : [];
  const hasMore = conversationsRaw.length > limit;
  const conversations = hasMore ? conversationsRaw.slice(0, limit) : conversationsRaw;
  const nextCursor = hasMore
    ? buildCursor(conversations[conversations.length - 1].last_message_at, conversations[conversations.length - 1].id)
    : null;

  const planTier = getPlanTierForUser(member.user_id);
  const monthlyLimit = getMonthlyMessageLimit(planTier);
  const monthStartIso = getMonthStartIso();

  const usageClient = supabase as unknown as AiChatUsageQueryClient;
  const usageResult = await usageClient
    .from("ai_chat_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", member.user_id)
    .eq("reservation_state", "committed")
    .gte("created_at", monthStartIso);

  if (usageResult.error) {
    console.error("[chat-conversations] failed to load usage", usageResult.error);
    await guard.release();
    return NextResponse.json({ error: "Failed to load usage." }, { status: 500 });
  }

  const usageUsed = usageResult.count ?? 0;
  await guard.release();

  return NextResponse.json({
    conversations: conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
      lastMessageAt: conversation.last_message_at,
    })),
    activeConversationId: cursor ? null : conversations[0]?.id ?? null,
    hasMore,
    nextCursor,
    usage: {
      used: usageUsed,
      limit: monthlyLimit,
      remaining: Math.max(monthlyLimit - usageUsed, 0),
      planTier,
    },
  });
}

export async function DELETE(request: Request) {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const projectSlug = url.searchParams.get("projectSlug")?.trim() || "";
  const conversationId = url.searchParams.get("conversationId")?.trim() || "";

  if (!projectSlug || !conversationId) {
    return NextResponse.json({ error: "Missing project slug or conversation id." }, { status: 400 });
  }

  const project = await getOrganizationProjectBySlugForCurrentUser(projectSlug);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const guard = await enforceRouteGuard({
    routeKey: "chat-delete",
    request,
    userId: member.user_id,
    userPerMinute: 20,
    ipPerMinute: 60,
    concurrentPerUser: 1,
  });
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const supabase = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { error: archiveConversationError } = await db
    .from("ai_chat_conversations")
    .update({
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId)
    .eq("user_id", member.user_id)
    .eq("project_slug", projectSlug);

  if (archiveConversationError) {
    await guard.release();
    return NextResponse.json({ error: "Unable to archive conversation." }, { status: 500 });
  }

  await guard.release();
  return NextResponse.json({ ok: true });
}
