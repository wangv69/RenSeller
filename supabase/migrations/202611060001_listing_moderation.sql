begin;

-- Existing listings also enter the queue: none are implicitly approved.
alter table public.listings
  add column moderation_status text not null default 'pending'
    check (moderation_status in ('pending', 'approved', 'rejected', 'removed'));

create function public.is_listing_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users
    where id = auth.uid()
      and raw_app_meta_data ->> 'group' = 'admin'
      and lower(email) like '%@rpi.edu'
      and email_confirmed_at is not null and deleted_at is null
      and (banned_until is null or banned_until <= now())
  );
$$;
revoke all on function public.is_listing_admin() from public, anon, authenticated;
grant execute on function public.is_listing_admin() to anon, authenticated;

alter table public.listings enable row level security;
-- Policies are ORed by PostgreSQL; replace legacy policies rather than leaving
-- a permissive read/write policy able to bypass moderation.
do $$
declare existing record;
begin
  for existing in select policyname from pg_policies where schemaname = 'public' and tablename = 'listings' loop
    execute format('drop policy %I on public.listings', existing.policyname);
  end loop;
end;
$$;

revoke all on public.listings from anon, authenticated;
-- Also remove legacy column-level grants, which survive a table-level revoke.
do $$
declare existing record;
begin
  for existing in select column_name, privilege_type, grantee from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'listings' and grantee in ('anon', 'authenticated') loop
    execute format('revoke %s (%I) on public.listings from %I', existing.privilege_type, existing.column_name, existing.grantee);
  end loop;
end;
$$;
grant select on public.listings to anon, authenticated;
grant insert (name, price, category, condition, seller_id, image_path) on public.listings to authenticated;

create policy "Public reads approved listings" on public.listings
for select to anon, authenticated using (moderation_status = 'approved');
create policy "Sellers and admins read review status" on public.listings
for select to authenticated using (seller_id = auth.uid() or public.is_listing_admin());
create policy "Students submit their own pending listings" on public.listings
for insert to authenticated with check (
  seller_id = auth.uid() and moderation_status = 'pending'
  and lower(auth.jwt() ->> 'email') like '%@rpi.edu'
);

create table public.listing_moderation_events (
  id bigint generated always as identity primary key,
  listing_id bigint not null references public.listings(id),
  actor_id uuid not null references auth.users(id),
  action text not null check (action in ('approve', 'reject', 'remove')),
  reason text not null check (length(trim(reason)) between 1 and 500),
  created_at timestamptz not null default now()
);
alter table public.listing_moderation_events enable row level security;
revoke all on public.listing_moderation_events from anon, authenticated;
grant select on public.listing_moderation_events to authenticated;
create policy "Admins read moderation history" on public.listing_moderation_events
for select to authenticated using (public.is_listing_admin());

create function public.moderate_listing(listing_id bigint, decision text, reason text, expected_status text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare current_status text;
begin
  if not public.is_listing_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if decision is null or decision not in ('approve', 'reject', 'remove')
     or reason is null or length(trim(reason)) not between 1 and 500 then
    raise exception 'Choose a valid decision and a reason of 1 to 500 characters' using errcode = '22023';
  end if;
  select moderation_status into current_status from public.listings where id = listing_id for update;
  if not found then
    raise exception 'Listing no longer exists' using errcode = 'P0002';
  end if;
  if expected_status is null or current_status <> expected_status or current_status = 'removed'
     or (decision in ('approve', 'reject') and current_status <> 'pending') then
    raise exception 'Listing changed; refresh before reviewing' using errcode = '40001';
  end if;
  update public.listings set moderation_status = case decision
    when 'approve' then 'approved' when 'reject' then 'rejected' else 'removed' end
  where id = listing_id;
  insert into public.listing_moderation_events (listing_id, actor_id, action, reason)
  values (listing_id, auth.uid(), decision, trim(reason));
end;
$$;
revoke all on function public.moderate_listing(bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.moderate_listing(bigint, text, text, text) to authenticated;

create index listings_moderation_status_id_idx on public.listings (moderation_status, id desc);
commit;
