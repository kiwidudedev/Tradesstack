import { supabase } from "./supabase";

export type JobTodo = {
  id: string;
  business_id: string;
  job_id: string;
  title: string;
  notes: string | null;
  due_date: string | null;
  is_done: boolean;
  created_at: string;
  updated_at?: string | null;
};

export type JobTodoInput = {
  title: string;
  notes?: string | null;
  due_date?: string | null;
};

export async function listJobTodos(jobId: string) {
  const { data, error } = await supabase
    .from("jobs_todos")
    .select("id, job_id, title, notes, due_date, is_done, created_at")
    .eq("job_id", jobId)
    .order("is_done", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Array<{
    id: string;
    job_id: string;
    title: string;
    notes: string | null;
    due_date: string | null;
    is_done: boolean;
    created_at: string;
  }>;
}

export async function getJobTodoById(id: string) {
  const { data, error } = await supabase
    .from("jobs_todos")
    .select("id, business_id, job_id, title, notes, due_date, is_done, created_at, updated_at")
    .eq("id", id)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to load to-do.");
  }

  return data as JobTodo;
}

export async function createJobTodo(businessId: string, jobId: string, payload: JobTodoInput) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(sessionError.message);
  }
  if (!sessionData.session) {
    throw new Error("Not authenticated.");
  }

  const { data, error } = await supabase
    .from("jobs_todos")
    .insert({
      business_id: businessId,
      job_id: jobId,
      title: payload.title.trim(),
      notes: payload.notes?.trim() || null,
      due_date: payload.due_date ?? null,
      is_done: false
    })
    .select("id, business_id, job_id, title, notes, due_date, is_done, created_at, updated_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create to-do.");
  }

  return data as JobTodo;
}

export async function updateJobTodo(id: string, patch: JobTodoInput) {
  const { data, error } = await supabase
    .from("jobs_todos")
    .update({
      title: patch.title.trim(),
      notes: patch.notes?.trim() || null,
      due_date: patch.due_date ?? null
    })
    .eq("id", id)
    .select("id, business_id, job_id, title, notes, due_date, is_done, created_at, updated_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update to-do.");
  }

  return data as JobTodo;
}

export async function toggleJobTodo(id: string, isDone: boolean) {
  const { data, error } = await supabase
    .from("jobs_todos")
    .update({ is_done: isDone })
    .eq("id", id)
    .select("id, business_id, job_id, title, notes, due_date, is_done, created_at, updated_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update to-do.");
  }

  return data as JobTodo;
}

export async function deleteJobTodo(id: string) {
  const { error } = await supabase.from("jobs_todos").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}
