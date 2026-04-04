alter table if exists public.project_variations
  add column if not exists validity_period text not null default '30 days',
  add column if not exists payment_terms text not null default '',
  add column if not exists lead_time text not null default '',
  add column if not exists terms_inclusions text not null default '',
  add column if not exists terms_exclusions text not null default '',
  add column if not exists clarifications text not null default '',
  add column if not exists assumptions text not null default '';
