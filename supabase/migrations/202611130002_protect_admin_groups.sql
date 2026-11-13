begin;

create or replace function public.set_account_group(target_user_id uuid, new_group text, reason text, expected_group text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare target auth.users%rowtype; current_group text;
begin
  -- Serialize role assignments before checking current permissions.
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
  if new_group = 'user' then
    raise exception 'Admin demotion is reserved for the Supabase project owner' using errcode = '42501';
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
