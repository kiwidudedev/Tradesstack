create unique index if not exists omlh_org_memory_supersession_basis_uidx
  on public.organization_memory_lifecycle_history (
    organization_id,
    memory_id,
    lifecycle_event_type,
    ((lifecycle_metadata ->> 'supersessionBasisHash'))
  )
  where lifecycle_event_type = 'memory_superseded'
    and lifecycle_metadata ? 'supersessionBasisHash';
