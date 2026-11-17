begin;

alter table public.listings enable row level security;
grant select on public.listings to anon, authenticated;

-- A restrictive legacy owner-only policy overrides permissive public reads.
-- Replace SELECT/ALL policies, including unknown names, with the review rules.
do $$
declare existing record;
begin
  for existing in select policyname from pg_policies
    where schemaname = 'public' and tablename = 'listings' and cmd in ('SELECT', 'ALL') loop
    execute format('drop policy %I on public.listings', existing.policyname);
  end loop;
end;
$$;

create policy "Public reads approved listings" on public.listings
for select to anon, authenticated using (moderation_status = 'approved');
create policy "Sellers and admins read review status" on public.listings
for select to authenticated using (seller_id = auth.uid() or public.is_listing_admin());

commit;
