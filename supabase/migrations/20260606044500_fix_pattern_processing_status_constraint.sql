alter table public.worksheet_pricing_pattern_evidence_processing
  drop constraint if exists worksheet_pricing_pattern_evidence_processing_processing_status_check;

alter table public.worksheet_pricing_pattern_evidence_processing
  drop constraint if exists worksheet_pricing_pattern_evidence_proc_processing_status_check;

alter table public.worksheet_pricing_pattern_evidence_processing
  add constraint worksheet_pricing_pattern_evidence_proc_processing_status_check check (
    processing_status in ('pending', 'claimed', 'processed', 'retry_scheduled', 'dead_lettered')
  );
