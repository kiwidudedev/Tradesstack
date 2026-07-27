import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260608104500_add_targeted_worksheet_memory_synthesis_queue_mode.sql",
  "utf8",
);

describe("worksheet memory synthesis targeted mode migration", () => {
  it("adds targeted semantic pool filtering to enqueue and claim RPCs", () => {
    expect(sql).toContain("drop function if exists public.enqueue_worksheet_memory_synthesis_queue(integer, uuid);");
    expect(sql).toContain("drop function if exists public.claim_worksheet_memory_synthesis_batch(integer, uuid, text, integer);");
    expect(sql).toContain("p_semantic_pool_id uuid default null");
    expect(sql).toContain("and (p_semantic_pool_id is null or p.id = p_semantic_pool_id)");
    expect(sql).toContain("and (p_semantic_pool_id is null or q.semantic_pool_id = p_semantic_pool_id)");
  });

  it("limits targeted enqueue and claim mode to one requested pool revision", () => {
    expect(sql).toContain("when p_semantic_pool_id is null then greatest(coalesce(p_limit, 200), 1)");
    expect(sql).toContain("else 1");
    expect(sql).toContain("when p_semantic_pool_id is null then greatest(coalesce(p_limit, 25), 1)");
    expect(sql).toContain("perform public.enqueue_worksheet_memory_synthesis_queue(");
    expect(sql).toContain("p_semantic_pool_id := p_semantic_pool_id");
  });

  it("grants service role access to the new targeted RPC signatures", () => {
    expect(sql).toContain("grant execute on function public.enqueue_worksheet_memory_synthesis_queue(integer, uuid, uuid) to service_role;");
    expect(sql).toContain("grant execute on function public.claim_worksheet_memory_synthesis_batch(integer, uuid, text, integer, uuid) to service_role;");
  });
});
