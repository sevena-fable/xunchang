create table public.song_gifts (
  id uuid primary key,
  pair_id uuid not null references public.pairs(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  audio_url text,
  storage_path text unique,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  check (num_nonnulls(audio_url, storage_path) = 1),
  check (audio_url is null or (
    char_length(audio_url) <= 2048 and audio_url ~ '^https://[^/@[:space:]]+([/?#]|$)'
  )),
  check (storage_path is null or storage_path in (
    pair_id || '/' || sender_id || '/' || id || '.mp3',
    pair_id || '/' || sender_id || '/' || id || '.m4a',
    pair_id || '/' || sender_id || '/' || id || '.wav',
    pair_id || '/' || sender_id || '/' || id || '.ogg'
  ))
);

create index song_gifts_inbox on public.song_gifts (pair_id, sender_id, created_at desc, id desc)
where seen_at is null;
create index song_gifts_pair_id on public.song_gifts (pair_id);
create index song_gifts_sender_id on public.song_gifts (sender_id);

alter table public.song_gifts enable row level security;
revoke all on public.song_gifts from public, anon, authenticated;
grant select, insert (id, pair_id, sender_id, audio_url, storage_path), update (seen_at)
  on public.song_gifts to authenticated;

create policy "song gifts: paired members can read"
on public.song_gifts for select to authenticated
using (exists (
  select 1 from public.pairs p where p.id = pair_id and p.status = 'paired'
    and sender_id in (p.user_a, p.user_b)
    and (select auth.uid()) in (p.user_a, p.user_b)
));

create policy "song gifts: paired sender can leave a song"
on public.song_gifts for insert to authenticated
with check (sender_id = (select auth.uid()) and exists (
  select 1 from public.pairs p where p.id = pair_id and p.status = 'paired'
    and (select auth.uid()) in (p.user_a, p.user_b)
));

create policy "song gifts: only the recipient can acknowledge"
on public.song_gifts for update to authenticated
using (seen_at is null and sender_id <> (select auth.uid()) and exists (
  select 1 from public.pairs p where p.id = pair_id and p.status = 'paired'
    and sender_id in (p.user_a, p.user_b)
    and (select auth.uid()) in (p.user_a, p.user_b)
))
with check (seen_at is not null and sender_id <> (select auth.uid()) and exists (
  select 1 from public.pairs p where p.id = pair_id and p.status = 'paired'
    and sender_id in (p.user_a, p.user_b)
    and (select auth.uid()) in (p.user_a, p.user_b)
));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('song-gifts', 'song-gifts', false, 6291456, array['audio/mpeg','audio/mp4','audio/wav','audio/ogg']);

-- A restrictive read gate keeps this bucket private even if another bucket
-- has an older permissive policy that forgot to check its bucket id.
create policy "song audio: read gate"
on storage.objects as restrictive for select to authenticated
using (bucket_id <> 'song-gifts' or (
  (select auth.uid()) is not null and (
    (storage.foldername(name))[2] = (select auth.uid())::text
    or exists (select 1 from public.song_gifts gift where gift.storage_path = name)
  )
));

create policy "song audio: authenticated read"
on storage.objects for select to authenticated using (bucket_id = 'song-gifts');

create policy "song audio: no anonymous access"
on storage.objects as restrictive for all to anon
using (bucket_id <> 'song-gifts') with check (bucket_id <> 'song-gifts');

create policy "song audio: write gate"
on storage.objects as restrictive for insert to authenticated
with check (bucket_id <> 'song-gifts' or (
  (storage.foldername(name))[2] = (select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(mp3|m4a|wav|ogg)$'
  and exists (
    select 1 from public.pairs p where p.id::text = (storage.foldername(name))[1]
      and p.status = 'paired' and (select auth.uid()) in (p.user_a, p.user_b)
  )
));

create policy "song audio: authenticated upload"
on storage.objects for insert to authenticated with check (bucket_id = 'song-gifts');

create policy "song audio: never overwrite"
on storage.objects as restrictive for update to public
using (bucket_id <> 'song-gifts') with check (bucket_id <> 'song-gifts');

create policy "song audio: cleanup gate"
on storage.objects as restrictive for delete to authenticated
using (bucket_id <> 'song-gifts' or (
  (storage.foldername(name))[2] = (select auth.uid())::text
  and not exists (select 1 from public.song_gifts gift where gift.storage_path = name)
));

create policy "song audio: authenticated cleanup"
on storage.objects for delete to authenticated using (bucket_id = 'song-gifts');

notify pgrst, 'reload schema';
