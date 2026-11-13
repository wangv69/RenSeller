begin;

alter table public.listings add column image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-images', 'listing-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Anyone can view photos (public bucket); only RPI students can upload, and only into their own folder.
create policy "RPI students upload to their own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'listing-images'
  and (storage.foldername(name))[1] = auth.uid()::text
  and lower(auth.jwt() ->> 'email') like '%@rpi.edu'
);

create policy "Owners delete their own listing images"
on storage.objects for delete to authenticated
using (bucket_id = 'listing-images' and (storage.foldername(name))[1] = auth.uid()::text);

commit;
