-- Only Auth-backed, confirmed RPI accounts appear in the student directory
begin;

create table public.messaging_members (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0)
);

alter table public.messaging_members enable row level security;
revoke all on public.messaging_members from anon, authenticated;
grant select on public.messaging_members to authenticated;

create policy "RPI students can read the member directory"
on public.messaging_members for select to authenticated
using (lower(auth.jwt() ->> 'email') like '%@rpi.edu');

create function public.sync_messaging_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is not null
     and lower(new.email) like '%@rpi.edu'
     and new.deleted_at is null
     and (new.banned_until is null or new.banned_until <= now()) then
    insert into public.messaging_members (id, full_name)
    values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)))
    on conflict (id) do update set full_name = excluded.full_name;
  else
    delete from public.messaging_members where id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_messaging_member() from public, anon, authenticated;
create trigger sync_messaging_member
after insert or update on auth.users
for each row execute function public.sync_messaging_member();

insert into public.messaging_members (id, full_name)
select id, coalesce(nullif(trim(raw_user_meta_data ->> 'full_name'), ''), split_part(email, '@', 1))
from auth.users
where email_confirmed_at is not null
  and lower(email) like '%@rpi.edu'
  and deleted_at is null
  and (banned_until is null or banned_until <= now());

commit;
