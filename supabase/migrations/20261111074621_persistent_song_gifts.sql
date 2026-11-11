alter table public.song_gifts add column title text check (char_length(title) <= 200);
grant insert (title), delete on public.song_gifts to authenticated;

create policy "song gifts: only the sender can remove"
on public.song_gifts for delete to authenticated
using (sender_id = (select auth.uid()) and exists (
  select 1 from public.pairs p where p.id = pair_id and p.status = 'paired'
    and (select auth.uid()) in (p.user_a, p.user_b)
));

create index song_gifts_playlist on public.song_gifts (pair_id, sender_id, created_at, id);
notify pgrst, 'reload schema';
