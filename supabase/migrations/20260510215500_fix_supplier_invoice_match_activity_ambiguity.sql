begin;

create or replace function public.handle_supplier_invoice_match_activity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  invoice_row public.supplier_invoices%rowtype;
  purchase_order_number_value text;
  event_type text;
  event_message text;
  event_metadata jsonb;
begin
  if tg_op = 'DELETE' then
    select *
    into invoice_row
    from public.supplier_invoices
    where id = old.supplier_invoice_id
      and organization_id = old.organization_id;

    select ppo.purchase_order_number
    into purchase_order_number_value
    from public.project_purchase_orders as ppo
    where ppo.id = old.purchase_order_id;

    event_type := 'match_removed';
    event_message := format(
      'Purchase order %s removed from the invoice match list.',
      coalesce(purchase_order_number_value, old.purchase_order_id::text)
    );
    event_metadata := jsonb_build_object(
      'purchase_order_id', old.purchase_order_id,
      'matched_amount', old.matched_amount,
      'match_status', old.match_status
    );

    if invoice_row.id is not null and invoice_row.status = 'Approved' then
      update public.supplier_invoices
      set status = 'Needs Review'
      where id = invoice_row.id
        and organization_id = invoice_row.organization_id
        and status = 'Approved';

      perform public.record_supplier_invoice_activity_event(
        old.organization_id,
        old.supplier_invoice_id,
        'reverted_to_needs_review',
        'Purchase order matching changed after approval. Invoice sent back to review.',
        jsonb_build_object(
          'reason', 'match_removed',
          'purchase_order_id', old.purchase_order_id
        ),
        auth.uid()
      );
    end if;

    perform public.record_supplier_invoice_activity_event(
      old.organization_id,
      old.supplier_invoice_id,
      event_type,
      event_message,
      event_metadata,
      auth.uid()
    );

    return old;
  end if;

  select *
  into invoice_row
  from public.supplier_invoices
  where id = new.supplier_invoice_id
    and organization_id = new.organization_id;

  select ppo.purchase_order_number
  into purchase_order_number_value
  from public.project_purchase_orders as ppo
  where ppo.id = new.purchase_order_id;

  if tg_op = 'INSERT' then
    event_type := 'match_added';
    event_message := format(
      'Purchase order %s matched to the invoice.',
      coalesce(purchase_order_number_value, new.purchase_order_id::text)
    );
    event_metadata := jsonb_build_object(
      'purchase_order_id', new.purchase_order_id,
      'matched_amount', new.matched_amount,
      'match_status', new.match_status
    );
  else
    if new.matched_amount is not distinct from old.matched_amount
      and new.match_status is not distinct from old.match_status
      and new.purchase_order_id is not distinct from old.purchase_order_id then
      return new;
    end if;

    event_type := 'match_updated';
    event_message := format(
      'Purchase order %s match updated.',
      coalesce(purchase_order_number_value, new.purchase_order_id::text)
    );
    event_metadata := jsonb_build_object(
      'purchase_order_id', new.purchase_order_id,
      'matched_amount', new.matched_amount,
      'match_status', new.match_status,
      'previous_matched_amount', old.matched_amount,
      'previous_match_status', old.match_status
    );
  end if;

  if invoice_row.id is not null
    and invoice_row.status = 'Approved'
    and (
      tg_op = 'INSERT'
      or new.matched_amount is distinct from old.matched_amount
      or new.match_status is distinct from old.match_status
      or new.purchase_order_id is distinct from old.purchase_order_id
    ) then
    update public.supplier_invoices
    set status = 'Needs Review'
    where id = invoice_row.id
      and organization_id = invoice_row.organization_id
      and status = 'Approved';

    perform public.record_supplier_invoice_activity_event(
      new.organization_id,
      new.supplier_invoice_id,
      'reverted_to_needs_review',
      'Purchase order matching changed after approval. Invoice sent back to review.',
      jsonb_build_object(
        'reason', case when tg_op = 'INSERT' then 'match_added' else 'match_updated' end,
        'purchase_order_id', new.purchase_order_id
      ),
      auth.uid()
    );
  end if;

  perform public.record_supplier_invoice_activity_event(
    new.organization_id,
    new.supplier_invoice_id,
    event_type,
    event_message,
    event_metadata,
    auth.uid()
  );

  return new;
end;
$$;

commit;
