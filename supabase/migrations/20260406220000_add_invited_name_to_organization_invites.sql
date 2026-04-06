alter table public.organization_invites
add column if not exists invited_name text;

alter table public.organization_invites
drop constraint if exists organization_invites_invited_name_not_blank;

alter table public.organization_invites
add constraint organization_invites_invited_name_not_blank
check (invited_name is null or char_length(trim(invited_name)) > 0);
