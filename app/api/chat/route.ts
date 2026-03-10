import { NextResponse } from "next/server";
import { getCurrentOrganizationMember, getOrganizationProjectBySlugForCurrentUser } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-5-mini";

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
}

type UsageCountResult = { count: number | null; error: { message: string } | null };

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

  const supabase = await createServerSupabaseClient();
  const planTier = getPlanTierForUser(member.user_id);
  const monthlyLimit = getMonthlyMessageLimit(planTier);
  const monthStartIso = getMonthStartIso();

  const usageClient = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string, options?: { count?: "exact"; head?: boolean }) => {
        eq: (column: string, value: string) => {
          gte: (column: string, value: string) => Promise<UsageCountResult>;
        };
      };
    };
  };

  const chatMessagesClient = supabase as unknown as {
    from: (table: "ai_chat_messages") => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => {
            order: (
              column: string,
              options: { ascending: boolean }
            ) => {
              limit: (
                count: number
              ) => Promise<{ data: AiChatMessageRow[] | null; error: { message: string } | null }>;
            };
          };
        };
      };
      insert: (rows: Array<Record<string, unknown>>) => Promise<{ error: { message: string } | null }>;
    };
  };
  const queryResult = await chatMessagesClient
    .from("ai_chat_messages")
    .select(messagesClientSelect)
    .eq("user_id", member.user_id)
    .eq("project_slug", projectSlug)
    .order("created_at", { ascending: true })
    .limit(200);

  if (queryResult.error) {
    return NextResponse.json({ error: `Failed to load chat history: ${queryResult.error.message}` }, { status: 500 });
  }

  const usageResult = await usageClient
    .from("ai_chat_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", member.user_id)
    .gte("created_at", monthStartIso);

  if (usageResult.error) {
    return NextResponse.json({ error: `Failed to load usage: ${usageResult.error.message}` }, { status: 500 });
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

  return NextResponse.json({
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
        messages?: IncomingMessage[];
      }
    | null;

  const projectSlug = typeof payload?.projectSlug === "string" ? payload.projectSlug.trim() : "";
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

  const member = await getCurrentOrganizationMember();
  if (!member) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const project = await getOrganizationProjectBySlugForCurrentUser(projectSlug);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const supabase = await createServerSupabaseClient();
  const chatMessagesClient = supabase as unknown as {
    from: (table: "ai_chat_messages") => {
      insert: (rows: Array<Record<string, unknown>>) => Promise<{ error: { message: string } | null }>;
    };
  };

  const planTier = getPlanTierForUser(member.user_id);
  const monthlyLimit = getMonthlyMessageLimit(planTier);
  const monthStartIso = getMonthStartIso();

  const usageClient = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string, options?: { count?: "exact"; head?: boolean }) => {
        eq: (column: string, value: string) => {
          gte: (column: string, value: string) => Promise<{ count: number | null; error: { message: string } | null }>;
        };
      };
      insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
  };

  const usageResult = await usageClient
    .from("ai_chat_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", member.user_id)
    .gte("created_at", monthStartIso);

  if (usageResult.error) {
    return NextResponse.json({ error: `Failed to check usage: ${usageResult.error.message}` }, { status: 500 });
  }

  const currentUsageCount = usageResult.count ?? 0;
  if (currentUsageCount >= monthlyLimit) {
    return NextResponse.json(
      {
        error: `Monthly AI message limit reached for ${planTier} plan (${monthlyLimit}).`,
      },
      { status: 429 }
    );
  }

  const latestUserMessage = [...normalizedMessages].reverse().find((message) => message.role === "user");
  if (latestUserMessage) {
    const userInsertResult = await chatMessagesClient.from("ai_chat_messages").insert([
      {
        user_id: member.user_id,
        organization_id: member.organization_id,
        project_slug: projectSlug,
        role: "user",
        content: latestUserMessage.content,
      },
    ]);

    if (userInsertResult.error) {
      return NextResponse.json(
        {
          error: `Unable to save user message: ${userInsertResult.error.message}`,
        },
        { status: 500 }
      );
    }
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

  const openAiResponse = await fetch(OPENAI_API_URL, {
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
  });

  if (!openAiResponse.ok || !openAiResponse.body) {
    const errorBody = await openAiResponse.text().catch(() => "");
    return NextResponse.json(
      {
        error: `OpenAI request failed: ${openAiResponse.status} ${openAiResponse.statusText}${errorBody ? ` - ${errorBody}` : ""}`,
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

        const insertResult = await usageClient.from("ai_chat_usage").insert({
          user_id: member.user_id,
          organization_id: member.organization_id,
          project_slug: projectSlug,
          tokens_used: usageTokens,
          response_chars: accumulatedText.length,
          plan_tier: planTier,
        });

        if (insertResult.error) {
          sendEvent({ type: "error", error: `Unable to record usage: ${insertResult.error.message}` });
        }

        if (accumulatedText.trim().length > 0) {
          const assistantInsertResult = await chatMessagesClient.from("ai_chat_messages").insert([
            {
              user_id: member.user_id,
              organization_id: member.organization_id,
              project_slug: projectSlug,
              role: "assistant",
              content: accumulatedText.trim(),
            },
          ]);
          if (assistantInsertResult.error) {
            sendEvent({ type: "error", error: `Unable to save AI message: ${assistantInsertResult.error.message}` });
          }
        }

        sendEvent({ type: "done" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Streaming failed.";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: message })}\n\n`));
      } finally {
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
    },
  });
}
