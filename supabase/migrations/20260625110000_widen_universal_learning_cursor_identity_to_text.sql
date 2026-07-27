alter table public.learning_review_cursors
  alter column last_cursor_id type text using last_cursor_id::text;

alter table public.learning_review_runs
  alter column previous_cursor_id type text using previous_cursor_id::text,
  alter column candidate_next_cursor_id type text using candidate_next_cursor_id::text,
  alter column final_next_cursor_id type text using final_next_cursor_id::text;
