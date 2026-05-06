create or replace function public.resolve_cost_item_document_context(
  p_document_kind text,
  p_document_id uuid
)
returns table (
  organization_id uuid,
  project_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    if current_user <> 'postgres' then
      raise exception 'Authentication is required';
    end if;
  end if;

  if p_document_kind = 'opportunity_quote' then
    return query
    select o.organization_id, o.workspace_project_id
    from public.opportunity_quotes q
    join public.organization_opportunities o
      on o.id = q.opportunity_id
     and o.organization_id = q.organization_id
    where q.id = p_document_id
      and o.workspace_project_id is not null
      and (
        current_user = 'postgres'
        or public.has_org_permission(o.organization_id, 'leads.opportunities.write')
      );
    return;
  end if;

  if p_document_kind = 'project_quote' then
    return query
    select q.organization_id, q.project_id
    from public.project_quotes q
    where q.id = p_document_id
      and (
        current_user = 'postgres'
        or public.has_org_permission(q.organization_id, 'quotes.write')
      );
    return;
  end if;

  if p_document_kind = 'project_variation' then
    return query
    select v.organization_id, v.project_id
    from public.project_variations v
    where v.id = p_document_id
      and (
        current_user = 'postgres'
        or public.has_org_permission(v.organization_id, 'variations.write')
      );
    return;
  end if;

  if p_document_kind = 'project_purchase_order' then
    return query
    select po.organization_id, po.project_id
    from public.project_purchase_orders po
    where po.id = p_document_id
      and (
        current_user = 'postgres'
        or public.has_org_permission(po.organization_id, 'purchase_orders.write')
      );
    return;
  end if;

  if p_document_kind = 'project_claim' then
    return query
    select c.organization_id, c.project_id
    from public.project_claims c
    where c.id = p_document_id
      and (
        current_user = 'postgres'
        or public.is_member_of_organization(c.organization_id)
      );
    return;
  end if;

  raise exception 'Unsupported CostItem document kind: %', p_document_kind;
end;
$$;
