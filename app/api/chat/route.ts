import { NextResponse } from "next/server";
import { getCurrentOrganizationMember, getOrganizationProjectBySlugForCurrentUser } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { enforceRouteGuard } from "@/lib/security/abuse-guard";
import { fetchWithTimeout } from "@/lib/security/fetch-timeout";

export const runtime = "nodejs";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-5-mini";
const CHAT_TIMEOUT_MS = 35_000;
const MAX_MESSAGE_CHARS = 4_000;
const MAX_CONVERSATION_CHARS = 20_000;

const SYSTEM_PROMPT = `You are a construction assistant specialising in New Zealand and Australian building projects.

Your role is to help builders, quantity surveyors, estimators, and project managers understand common construction practices.

Base answers on typical NZ/AU construction methods and standards where relevant.

Do not invent specific code clauses or regulatory requirements. If compliance confirmation is required, advise the user to verify with project specifications, consultants, or local regulations.

Response Format Rules:

1. Start with a short heading.
2. Provide 3–5 bullet points only.
3. Each bullet must be a single short sentence.
4. Do NOT write paragraphs.
5. Keep the entire response concise and easy to scan in a chat interface.`;

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
};

type PlanTier = "starter" | "pro";

interface AiChatMessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  conversation_id?: string | null;
}

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

interface AiChatQuotaRpcClient {
  rpc(
    fn: "reserve_ai_chat_usage_quota",
    params: {
      p_user_id: string;
      p_organization_id: string;
      p_project_slug: string;
      p_plan_tier: string;
      p_month_start: string;
      p_monthly_limit: number;
    }
  ): Promise<{ data: string | null; error: { message: string } | null }>;
  rpc(
    fn: "release_ai_chat_quota_reservation",
    params: { p_usage_id: string }
  ): Promise<{ data: boolean | null; error: { message: string } | null }>;
  rpc(
    fn: "commit_ai_chat_quota_reservation",
    params: {
      p_usage_id: string;
      p_tokens_used: number;
      p_response_chars: number;
    }
  ): Promise<{ data: boolean | null; error: { message: string } | null }>;
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

function extractDeltaFromOpenAiEvent(payload: Record<string, unknown>): string {
  if (payload.type === "response.output_text.delta" && typeof payload.delta === "string") {
    return payload.delta;
  }

  return "";
}

function tryExtractUsageTokens(payload: Record<string, unknown>): number {
  if (payload.type !== "response.completed") {
    return 0;
  }

  const response = payload.response;
  if (!response || typeof response !== "object") {
    return 0;
  }

  const usage = (response as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") {
    return 0;
  }

  const inputTokens = typeof (usage as { input_tokens?: unknown }).input_tokens === "number" ? (usage as { input_tokens: number }).input_tokens : 0;
  const outputTokens =
    typeof (usage as { output_tokens?: unknown }).output_tokens === "number" ? (usage as { output_tokens: number }).output_tokens : 0;
  const totalTokens =
    typeof (usage as { total_tokens?: unknown }).total_tokens === "number" ? (usage as { total_tokens: number }).total_tokens : inputTokens + outputTokens;

  return Number.isFinite(totalTokens) ? totalTokens : 0;
}

const messagesClientSelect = "id, role, content, created_at";

function toConversationTitle(input: string) {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "New Chat";
  }
  return normalized.slice(0, 80);
}

function extractAssistantHeadingTitle(content: string) {
  const lines = content.split("\n");
  const headingLine =
    lines.find((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith("•");
    }) ?? "";
  return toConversationTitle(headingLine);
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
    routeKey: "chat-history",
    request,
    userId: member.user_id,
    userPerMinute: 60,
    ipPerMinute: 120,
    concurrentPerUser: 0,
  });
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const supabase = await createServerSupabaseClient();
  const planTier = getPlanTierForUser(member.user_id);
  const monthlyLimit = getMonthlyMessageLimit(planTier);
  const monthStartIso = getMonthStartIso();
  const conversationId = url.searchParams.get("conversationId")?.trim() || "";

  const usageClient = supabase as unknown as AiChatUsageQueryClient;
  const chatDb = supabase as any;

  const conversationsResult = await chatDb
    .from("ai_chat_conversations")
    .select("id, title, created_at, updated_at, last_message_at")
    .eq("user_id", member.user_id)
    .eq("project_slug", projectSlug)
    .is("archived_at", null)
    .order("last_message_at", { ascending: false });

  if (conversationsResult.error) {
    console.error("[chat] failed to load conversations", conversationsResult.error);
    await guard.release();
    return NextResponse.json({ error: "Failed to load chat history." }, { status: 500 });
  }

  const conversations: AiChatConversationRow[] = Array.isArray(conversationsResult.data)
    ? (conversationsResult.data as AiChatConversationRow[])
    : [];
  const activeConversationId =
    (conversationId && conversations.some((conversation) => conversation.id === conversationId) ? conversationId : "") ||
    conversations[0]?.id ||
    null;

  let queryResult: { data: AiChatMessageRow[] | null; error: { message: string } | null } = {
    data: [],
    error: null,
  };

  if (activeConversationId) {
    queryResult = await chatDb
      .from("ai_chat_messages")
      .select(messagesClientSelect)
      .eq("user_id", member.user_id)
      .eq("project_slug", projectSlug)
      .eq("conversation_id", activeConversationId)
      .order("created_at", { ascending: true })
      .limit(200);

    if (queryResult.error) {
      console.error("[chat] failed to load conversation history", queryResult.error);
      await guard.release();
      return NextResponse.json({ error: "Failed to load chat history." }, { status: 500 });
    }
  }

  const usageResult = await usageClient
    .from("ai_chat_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", member.user_id)
    .eq("reservation_state", "committed")
    .gte("created_at", monthStartIso);

  if (usageResult.error) {
    console.error("[chat] failed to load usage", usageResult.error);
    await guard.release();
    return NextResponse.json({ error: "Failed to load usage." }, { status: 500 });
  }

  const usageUsed = usageResult.count ?? 0;

  const messages = (queryResult.data ?? [])
    .filter((row) => row.role === "user" || row.role === "assistant")
    .map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      createdAt: row.created_at,
    }));

  await guard.release();
  return NextResponse.json({
    conversations: conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
      lastMessageAt: conversation.last_message_at,
    })),
    activeConversationId,
    messages,
    usage: {
      used: usageUsed,
      limit: monthlyLimit,
      remaining: Math.max(monthlyLimit - usageUsed, 0),
      planTier,
    },
  });
}

export async function POST(request: Request) {
  const openAiApiKey = process.env.OPENAI_API_KEY;
  if (!openAiApiKey) {
    return NextResponse.json({ error: "Missing OPENAI_API_KEY." }, { status: 500 });
  }

  const payload = (await request.json().catch(() => null)) as
    | {
        projectSlug?: string;
        conversationId?: string;
        messages?: IncomingMessage[];
      }
    | null;

  const projectSlug = typeof payload?.projectSlug === "string" ? payload.projectSlug.trim() : "";
  const requestConversationId = typeof payload?.conversationId === "string" ? payload.conversationId.trim() : "";
  const messages = Array.isArray(payload?.messages) ? payload!.messages : [];

  if (!projectSlug) {
    return NextResponse.json({ error: "Missing project slug." }, { status: 400 });
  }

  if (messages.length === 0) {
    return NextResponse.json({ error: "Provide at least one message." }, { status: 400 });
  }

  const normalizedMessages = messages
    .filter((message) => (message.role === "user" || message.role === "assistant") && typeof message.content === "string")
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-12);

  if (normalizedMessages.length === 0) {
    return NextResponse.json({ error: "No valid message content provided." }, { status: 400 });
  }

  if (normalizedMessages.some((message) => message.content.length > MAX_MESSAGE_CHARS)) {
    return NextResponse.json({ error: "One or more messages are too long." }, { status: 413 });
  }

  const totalMessageChars = normalizedMessages.reduce((sum, message) => sum + message.content.length, 0);
  if (totalMessageChars > MAX_CONVERSATION_CHARS) {
    return NextResponse.json({ error: "Conversation payload is too large." }, { status: 413 });
  }

  const member = await getCurrentOrganizationMember();
  if (!member) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const project = await getOrganizationProjectBySlugForCurrentUser(projectSlug);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const guard = await enforceRouteGuard({
    routeKey: "chat",
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
  const chatMessagesClient = supabase as unknown as {
    from: (table: "ai_chat_messages") => {
      insert: (rows: Array<Record<string, unknown>>) => Promise<{ error: { message: string } | null }>;
    };
  };
  const dynamicSupabase = supabase as unknown as {
    from: (table: "ai_chat_conversations") => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => {
            eq: (column: string, value: string) => {
              is: (column: string, value: null) => {
                limit: (
                  count: number
                ) => Promise<{ data: AiChatConversationRow[] | null; error: { message: string } | null }>;
              };
            };
          };
        };
      };
      insert: (rows: Array<Record<string, unknown>>) => {
        select: (columns: string) => {
          limit: (
            count: number
          ) => Promise<{ data: AiChatConversationRow[] | null; error: { message: string } | null }>;
        };
      };
      update: (values: Record<string, unknown>) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    };
  };

  const planTier = getPlanTierForUser(member.user_id);
  const monthlyLimit = getMonthlyMessageLimit(planTier);
  const monthStartIso = getMonthStartIso();

  const quotaClient = supabase as unknown as AiChatQuotaRpcClient;

  const quotaReservationResult = await quotaClient.rpc("reserve_ai_chat_usage_quota", {
    p_user_id: member.user_id,
    p_organization_id: member.organization_id,
    p_project_slug: projectSlug,
    p_plan_tier: planTier,
    p_month_start: monthStartIso,
    p_monthly_limit: monthlyLimit,
  });

  if (quotaReservationResult.error) {
    await guard.release();
    return NextResponse.json({ error: "Unable to check usage right now." }, { status: 500 });
  }

  const usageReservationId = typeof quotaReservationResult.data === "string" ? quotaReservationResult.data : null;
  if (!usageReservationId) {
    await guard.release();
    return NextResponse.json(
      {
        error: `Monthly AI message limit reached for ${planTier} plan (${monthlyLimit}).`,
      },
      { status: 429 }
    );
  }

  let shouldReleaseQuotaReservation = true;
  const releaseQuotaReservation = async () => {
    if (!shouldReleaseQuotaReservation) {
      return;
    }
    shouldReleaseQuotaReservation = false;
    const releaseResult = await quotaClient.rpc("release_ai_chat_quota_reservation", {
      p_usage_id: usageReservationId,
    });
    if (releaseResult.error) {
      console.error("[chat] failed to release quota reservation", releaseResult.error);
    }
  };

  const latestUserMessage = [...normalizedMessages].reverse().find((message) => message.role === "user");
  let activeConversationId = requestConversationId || "";

  if (activeConversationId) {
    const existingConversationResult = await dynamicSupabase
      .from("ai_chat_conversations")
      .select("id, title, created_at, updated_at, last_message_at")
      .eq("id", activeConversationId)
      .eq("user_id", member.user_id)
      .eq("project_slug", projectSlug)
      .is("archived_at", null)
      .limit(1);

    if (existingConversationResult.error || !existingConversationResult.data?.[0]) {
      await releaseQuotaReservation();
      await guard.release();
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }
  } else {
    const createConversationResult = await dynamicSupabase
      .from("ai_chat_conversations")
      .insert([
        {
          user_id: member.user_id,
          organization_id: member.organization_id,
          project_slug: projectSlug,
          title: "New Chat",
          last_message_at: new Date().toISOString(),
        },
      ])
      .select("id, title, created_at, updated_at, last_message_at")
      .limit(1);

    if (createConversationResult.error || !createConversationResult.data?.[0]) {
      await releaseQuotaReservation();
      await guard.release();
      return NextResponse.json({ error: "Unable to create chat conversation." }, { status: 500 });
    }

    activeConversationId = createConversationResult.data[0].id;
  }

  if (latestUserMessage) {
    const userInsertResult = await chatMessagesClient.from("ai_chat_messages").insert([
      {
        user_id: member.user_id,
        organization_id: member.organization_id,
        project_slug: projectSlug,
        conversation_id: activeConversationId,
        role: "user",
        content: latestUserMessage.content,
      },
    ]);

    if (userInsertResult.error) {
      await releaseQuotaReservation();
      await guard.release();
      return NextResponse.json(
        {
          error: "Unable to save user message.",
        },
        { status: 500 }
      );
    }
  }

  const updateConversationAfterUserMessageResult = await dynamicSupabase
    .from("ai_chat_conversations")
    .update({
      updated_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
    })
    .eq("id", activeConversationId)
    .eq("user_id", member.user_id);

  if (updateConversationAfterUserMessageResult.error) {
    console.error("[chat] failed to update conversation metadata", updateConversationAfterUserMessageResult.error);
  }

  const responseInput = [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: SYSTEM_PROMPT,
        },
      ],
    },
    ...normalizedMessages.map((message) => ({
      role: message.role,
      content: [
        {
          type: message.role === "assistant" ? "output_text" : "input_text",
          text: message.content,
        },
      ],
    })),
  ];

  let openAiResponse: Response;
  try {
    openAiResponse = await fetchWithTimeout(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiApiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_CHAT_MODEL,
        stream: true,
        input: responseInput,
      }),
    }, CHAT_TIMEOUT_MS);
  } catch (error) {
    await releaseQuotaReservation();
    await guard.release();
    console.error("[chat] upstream request failed", error);
    return NextResponse.json({ error: "AI provider request failed." }, { status: 502 });
  }

  if (!openAiResponse.ok || !openAiResponse.body) {
    await releaseQuotaReservation();
    await guard.release();
    console.error("[chat] upstream non-ok response", openAiResponse.status, openAiResponse.statusText);
    return NextResponse.json(
      {
        error: "AI provider request failed.",
      },
      { status: 502 }
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const openAiReader = openAiResponse.body.getReader();

  let buffer = "";
  let accumulatedText = "";
  let usageTokens = 0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendEvent = (payloadToSend: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payloadToSend)}\n\n`));
      };

      try {
        while (true) {
          const { done, value } = await openAiReader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";

          for (const chunk of chunks) {
            const dataLines = chunk
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trim());

            if (dataLines.length === 0) {
              continue;
            }

            const rawData = dataLines.join("\n");
            if (!rawData || rawData === "[DONE]") {
              continue;
            }

            let eventPayload: Record<string, unknown> | null = null;
            try {
              eventPayload = JSON.parse(rawData) as Record<string, unknown>;
            } catch {
              continue;
            }

            if (!eventPayload) {
              continue;
            }

            const delta = extractDeltaFromOpenAiEvent(eventPayload);
            if (delta) {
              accumulatedText += delta;
              sendEvent({ type: "delta", delta });
            }

            const tokens = tryExtractUsageTokens(eventPayload);
            if (tokens > 0) {
              usageTokens = tokens;
            }
          }
        }

        const commitResult = await quotaClient.rpc("commit_ai_chat_quota_reservation", {
          p_usage_id: usageReservationId,
          p_tokens_used: usageTokens,
          p_response_chars: accumulatedText.length,
        });

        if (commitResult.error || commitResult.data !== true) {
          sendEvent({ type: "error", error: "Unable to record usage." });
          shouldReleaseQuotaReservation = false;
        } else {
          shouldReleaseQuotaReservation = false;
        }

        if (accumulatedText.trim().length > 0) {
          const assistantInsertResult = await chatMessagesClient.from("ai_chat_messages").insert([
            {
              user_id: member.user_id,
              organization_id: member.organization_id,
              project_slug: projectSlug,
              conversation_id: activeConversationId,
              role: "assistant",
              content: accumulatedText.trim(),
            },
          ]);
          if (assistantInsertResult.error) {
            sendEvent({ type: "error", error: "Unable to save AI response." });
          }

          const updateConversationResult = await (dynamicSupabase as any)
            .from("ai_chat_conversations")
            .update({
              title: extractAssistantHeadingTitle(accumulatedText),
              updated_at: new Date().toISOString(),
              last_message_at: new Date().toISOString(),
            })
            .eq("id", activeConversationId)
            .eq("user_id", member.user_id)
            .eq("title", "New Chat");
          if (updateConversationResult.error) {
            console.error("[chat] failed to update conversation after assistant response", updateConversationResult.error);
          }
        }

        sendEvent({ type: "done" });
      } catch (error) {
        console.error("[chat] stream failed", error);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: "Streaming failed." })}\n\n`));
      } finally {
        await releaseQuotaReservation();
        await guard.release();
        controller.close();
        openAiReader.releaseLock();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Conversation-Id": activeConversationId,
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
