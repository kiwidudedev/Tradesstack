import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type DynamicSupabaseError = {
  code?: string;
  message: string;
};

export type DynamicSupabaseResult<T = unknown> = {
  data: T | null;
  error: DynamicSupabaseError | null;
};

export type DynamicSupabaseQuery<T = unknown> = PromiseLike<DynamicSupabaseResult<T>> & {
  select(columns?: string): DynamicSupabaseQuery<T>;
  insert(values: unknown): DynamicSupabaseQuery<T>;
  update(values: Record<string, unknown>): DynamicSupabaseQuery<T>;
  upsert(values: unknown, options?: Record<string, unknown>): DynamicSupabaseQuery<T>;
  eq(column: string, value: unknown): DynamicSupabaseQuery<T>;
  gte(column: string, value: unknown): DynamicSupabaseQuery<T>;
  lt(column: string, value: unknown): DynamicSupabaseQuery<T>;
  in(column: string, values: unknown[]): DynamicSupabaseQuery<T>;
  or(expression: string): DynamicSupabaseQuery<T>;
  order(column: string, options?: Record<string, unknown>): DynamicSupabaseQuery<T>;
  limit(count: number): DynamicSupabaseQuery<T>;
  maybeSingle(): Promise<DynamicSupabaseResult<T>>;
  single(): Promise<DynamicSupabaseResult<T>>;
};

export type DynamicSupabaseAdminClient = {
  from<T = unknown>(table: string): DynamicSupabaseQuery<T>;
  rpc<T = unknown>(functionName: string, args?: Record<string, unknown>): Promise<DynamicSupabaseResult<T>>;
};

export function createDynamicAdminSupabaseClient() {
  return createAdminSupabaseClient() as unknown as DynamicSupabaseAdminClient;
}
