update public.cost_items
set work_type = null
where work_type is not null
  and btrim(work_type) = '';

update public.cost_items
set cost_type = null
where btrim(cost_type) = '';

update public.cost_items
set cost_code = null
where btrim(cost_code) = '';

alter table public.cost_items
  alter column cost_type drop default,
  alter column cost_type drop not null,
  alter column cost_code drop default,
  alter column cost_code drop not null;
