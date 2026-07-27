create or replace function public.can_insert_commercial_item_document_link(
  p_organization_id uuid,
  p_commercial_item_id uuid,
  p_document_kind text,
  p_document_id uuid,
  p_document_line_id uuid,
  p_link_role text
)
returns boolean
language sql
stable
as $$
  select case
    when p_document_kind = 'quote_line' then exists (
      select 1
      from public.commercial_items item
      join public.project_quote_line_items line
        on line.id = p_document_line_id
       and line.quote_id = p_document_id
       and line.organization_id = p_organization_id
      join public.project_quotes quote
        on quote.id = line.quote_id
       and quote.organization_id = p_organization_id
      left join public.organization_projects project
        on project.id = quote.project_id
       and project.organization_id = p_organization_id
      where item.id = p_commercial_item_id
        and item.organization_id = p_organization_id
        and quote.originating_opportunity_id = item.opportunity_id
        and item.project_id is not distinct from quote.project_id
        and line.project_id is not distinct from quote.project_id
        and (
          quote.project_id is null
          or project.source_opportunity_id is null
          or project.source_opportunity_id = item.opportunity_id
        )
        and (
          p_link_role <> 'source'
          or not exists (
            select 1
            from public.commercial_item_document_links existing_link
            where existing_link.organization_id = p_organization_id
              and existing_link.document_kind = 'quote_line'
              and existing_link.document_line_id = p_document_line_id
              and existing_link.link_role = 'source'
              and existing_link.commercial_item_id <> p_commercial_item_id
          )
        )
    )
    when p_document_kind = 'purchase_order_line' then exists (
      select 1
      from public.commercial_items item
      join public.organization_projects project
        on project.id = item.project_id
       and project.organization_id = item.organization_id
      join public.project_purchase_order_line_items line
        on line.id = p_document_line_id
       and line.purchase_order_id = p_document_id
       and line.organization_id = p_organization_id
      join public.project_purchase_orders purchase_order
        on purchase_order.id = line.purchase_order_id
       and purchase_order.organization_id = p_organization_id
      where item.id = p_commercial_item_id
        and item.organization_id = p_organization_id
        and item.project_id is not null
        and item.project_id = line.project_id
        and item.project_id = purchase_order.project_id
        and project.source_opportunity_id = item.opportunity_id
        and (
          p_link_role <> 'source'
          or not exists (
            select 1
            from public.commercial_item_document_links existing_link
            where existing_link.organization_id = p_organization_id
              and existing_link.document_kind = 'purchase_order_line'
              and existing_link.document_line_id = p_document_line_id
              and existing_link.link_role = 'source'
              and existing_link.commercial_item_id <> p_commercial_item_id
          )
        )
    )
    else false
  end;
$$;
