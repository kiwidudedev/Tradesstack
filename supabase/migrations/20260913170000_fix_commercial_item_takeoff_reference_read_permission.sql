begin;

-- listCommercialItemsByIds includes this provenance column when reloading
-- published worksheet and takeoff lines. It was added after the safe column
-- grants, so authenticated reads failed even after publication committed.
-- Keep locked_metadata_json private and preserve the existing row policies.
grant select (source_takeoff_measurement_id)
  on public.commercial_items to authenticated;

commit;
