begin;

create function public.list_account_groups(query_text text default '', page_offset integer default 0)
returns table (user_id uuid, email text, account_group text, eligible boolean)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_listing_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if query_text is null or length(trim(query_text)) > 200 or page_offset is null or page_offset < 0 then
    raise exception 'Enter a search of at most 200 characters and a valid page' using errcode = '22023';
  end if;
  return query
    select u.id, u.email::text,
      case when u.raw_app_meta_data ->> 'group' = 'admin' then 'admin' else 'user' end,
      u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until <= now())
    from auth.users u
    where u.deleted_at is null and lower(u.email) like '%@rpi.edu'
      and position(lower(trim(query_text)) in lower(u.email)) > 0
    order by lower(u.email), u.id
    limit 51 offset page_offset;
end;
$$;
revoke all on function public.list_account_groups(text, integer) from public, anon, authenticated;
grant execute on function public.list_account_groups(text, integer) to authenticated;

create table public.account_group_events (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id),
  target_user_id uuid not null references auth.users(id),
  old_group text not null check (old_group in ('user', 'admin')),
  new_group text not null check (new_group in ('user', 'admin')),
  reason text not null check (length(trim(reason)) between 1 and 500),
  created_at timestamptz not null default now()
);
alter table public.account_group_events enable row level security;
revoke all on public.account_group_events from public, anon, authenticated;
grant select on public.account_group_events to authenticated;
create policy "Admins read group changes" on public.account_group_events
for select to authenticated using (public.is_listing_admin());

create function public.set_account_group(target_user_id uuid, new_group text, reason text, expected_group text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare target auth.users%rowtype; current_group text;
begin
  -- Serialize changes before checking the caller, so two admins cannot demote each other concurrently.
  perform pg_advisory_xact_lock(hashtextextended('renseller.account_groups', 0));
  if not public.is_listing_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if new_group is null or new_group not in ('user', 'admin')
     or expected_group is null or expected_group not in ('user', 'admin')
     or reason is null or length(trim(reason)) not between 1 and 500
     or target_user_id = auth.uid() then
    raise exception 'Choose another account, a valid group, and a reason of 1 to 500 characters' using errcode = '22023';
  end if;
  select * into target from auth.users where id = target_user_id for update;
  if not found then
    raise exception 'Account no longer exists' using errcode = 'P0002';
  end if;
  current_group := case when target.raw_app_meta_data ->> 'group' = 'admin' then 'admin' else 'user' end;
  if current_group <> expected_group or current_group = new_group then
    raise exception 'Account changed; refresh before retrying' using errcode = '40001';
  end if;
  if new_group = 'admin' and (target.email is null or lower(target.email) not like '%@rpi.edu'
     or target.email_confirmed_at is null or target.deleted_at is not null
     or (target.banned_until is not null and target.banned_until > now())) then
    raise exception 'Only confirmed, active RPI accounts can become admins' using errcode = '22023';
  end if;
  update auth.users set raw_app_meta_data =
    (case when jsonb_typeof(raw_app_meta_data) = 'object' then raw_app_meta_data else '{}'::jsonb end)
    || jsonb_build_object('group', new_group) where id = target_user_id;
  insert into public.account_group_events (actor_id, target_user_id, old_group, new_group, reason)
  values (auth.uid(), target_user_id, current_group, new_group, trim(reason));
end;
$$;
revoke all on function public.set_account_group(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.set_account_group(uuid, text, text, text) to authenticated;

commit;
