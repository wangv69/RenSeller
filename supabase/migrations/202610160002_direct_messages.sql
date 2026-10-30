begin;

create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

create index direct_messages_conversation on public.direct_messages (sender_id, recipient_id, created_at, id);
create index direct_messages_recipient on public.direct_messages (recipient_id, created_at);
alter table public.direct_messages enable row level security;
revoke all on public.direct_messages from anon, authenticated;
grant select on public.direct_messages to authenticated;
grant insert (id, sender_id, recipient_id, body) on public.direct_messages to authenticated;

create policy "Participants read their messages"
on public.direct_messages for select to authenticated
using (auth.uid() = sender_id or auth.uid() = recipient_id);

create policy "Members send as themselves"
on public.direct_messages for insert to authenticated
with check (
  auth.uid() = sender_id
  and exists (select 1 from public.messaging_members where id = auth.uid())
  and exists (select 1 from public.messaging_members where id = recipient_id)
);

-- Postgres Changes also applies the SELECT policy to each subscriber
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_messages'
  ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
end;
$$;

commit;
