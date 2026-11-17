begin;

create policy "Sellers delete their own listings"
on public.listings for delete to authenticated
using (seller_id = auth.uid());

commit;
