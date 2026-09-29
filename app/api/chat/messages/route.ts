import { NextResponse } from "next/server";
import { getCurrentOrganizationMember, getOrganizationProjectBySlugForCurrentUser } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { enforceRouteGuard } from "@/lib/security/abuse-guard";

export const runtime = "nodejs";

interface AiChatMessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

const MESSAGES_SELECT = "id, role, content, created_at";

function parseCursor(cursorRaw: string | null): { createdAt: string; id: string } | null {
  if (!cursorRaw) {
    return null;
  }
  const [createdAt, id] = cursorRaw.split("|");
  if (!createdAt || !id) {
    return null;
  }
  if (!Number.isFinite(Date.parse(createdAt))) {
    return null;
  }
  return { createdAt, id };
}

function buildCursor(createdAt: string, id: string) {
  return `${createdAt}|${id}`;
}

export async function GET(request: Request) {
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
    routeKey: "chat-messages",
    request,
    userId: member.user_id,
    userPerMinute: 120,
    ipPerMinute: 240,
    concurrentPerUser: 0,
  });
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const parsedLimit = Number(url.searchParams.get("limit") || "120");
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(Math.floor(parsedLimit), 1), 200) : 120;
  const cursor = parseCursor(url.searchParams.get("cursor"));

  const supabase = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const conversationResult = await db
    .from("ai_chat_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", member.user_id)
    .eq("project_slug", projectSlug)
    .is("archived_at", null)
    .limit(1);

  if (conversationResult.error || !conversationResult.data?.[0]) {
    await guard.release();
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  let messagesQuery = db
    .from("ai_chat_messages")
    .select(MESSAGES_SELECT)
    .eq("user_id", member.user_id)
    .eq("project_slug", projectSlug)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    messagesQuery = messagesQuery.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
    );
  }

  const messagesResult = await messagesQuery;

  if (messagesResult.error) {
    console.error("[chat-messages] failed to load conversation history", messagesResult.error);
    await guard.release();
    return NextResponse.json({ error: "Failed to load chat history." }, { status: 500 });
  }

  const messagesRaw = ((messagesResult.data as AiChatMessageRow[] | null) ?? []).filter(
    (row) => row.role === "user" || row.role === "assistant"
  );
  const hasMore = messagesRaw.length > limit;
  const pageRowsDesc = hasMore ? messagesRaw.slice(0, limit) : messagesRaw;
  const nextCursor = hasMore
    ? buildCursor(pageRowsDesc[pageRowsDesc.length - 1].created_at, pageRowsDesc[pageRowsDesc.length - 1].id)
    : null;

  const messages = pageRowsDesc
    .slice()
    .reverse()
    .filter((row) => row.role === "user" || row.role === "assistant")
    .map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      createdAt: row.created_at,
    }));

  await guard.release();
  return NextResponse.json({ messages, hasMore, nextCursor });
}
