begin;

-- RLS policies do not grant table privileges by themselves.
grant delete on public.listings to authenticated;
drop policy if exists "Sellers delete their own listings" on public.listings;
create policy "Sellers delete their own listings" on public.listings
for delete to authenticated using (seller_id = auth.uid());

-- Audit events retain the original listing ID after its owner deletes the row.
-- Keep the events immutable instead of cascading away the moderation history.
alter table public.listing_moderation_events
  drop constraint listing_moderation_events_listing_id_fkey;

commit;
