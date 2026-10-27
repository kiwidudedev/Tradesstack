import { createServer } from "node:http";
import { processNextTakeoffRenderJob } from "../lib/takeoff-server";

const port = Number(process.env.PORT ?? 8787);
const token = process.env.TAKEOFF_CONTAINER_TOKEN ?? "";
const maxJobMs = Math.max(30_000, Number(process.env.TAKEOFF_CONTAINER_MAX_JOB_SECONDS ?? 240) * 1000);

const writeJson = async (response: import("node:http").ServerResponse, status: number, body: Record<string, unknown>) => {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
};

const server = createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/health") {
      await writeJson(response, 200, { ok: true, service: "takeoff-renderer" });
      return;
    }
    if (request.method !== "POST" || request.url !== "/process") {
      response.writeHead(404);
      response.end();
      return;
    }
    if (!token || request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401);
      response.end();
      return;
    }
    const result = await Promise.race([
      (async () => {
        const completed: Array<{ jobId: string | null; drawingSetId: string | null; pagesRendered: number }> = [];
        for (let index = 0; index < 4; index += 1) {
          const next = await processNextTakeoffRenderJob();
          if (!next.job) break;
          completed.push({ jobId: next.job.id, drawingSetId: next.job.drawing_set_id, pagesRendered: next.pagesRendered });
        }
        return completed;
      })(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Takeoff render job exceeded container timeout.")), maxJobMs)),
    ]);
    console.info("[takeoff-container] processed jobs", { jobs: result });
    await writeJson(response, 200, { ok: true, jobs: result, jobId: result[0]?.jobId ?? null, pagesRendered: result.reduce((sum, item) => sum + item.pagesRendered, 0) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("[takeoff-container] render failure", { error: message.slice(0, 240) });
    await writeJson(response, 500, { ok: false, error: "Takeoff render failed.", stage: message.slice(0, 160) });
  }
});

server.listen(port, "0.0.0.0", () => console.info("[takeoff-container] ready", { port }));
