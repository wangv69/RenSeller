begin;

-- Optional course a textbook is for, stored as DEPT-1234 (for example MATH-1010).
alter table public.listings
  add column if not exists course_code text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'listings_course_code_format' and conrelid = 'public.listings'::regclass
  ) then
    alter table public.listings
      add constraint listings_course_code_format
      check (course_code is null or course_code ~ '^[A-Z]{3,4}-[0-9]{4}$');
  end if;
end;
$$;

-- Needed if sellers' insert permission is granted per column; harmless if it is table-wide.
grant insert (course_code) on public.listings to authenticated;

commit;
