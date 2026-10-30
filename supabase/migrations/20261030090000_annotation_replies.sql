-- 阅读者的原文批注回复。只新增结构，保留分享者原有的 annotations。
begin;

create table public.annotation_replies (
  id uuid primary key,
  letter_id uuid not null references public.letters(id) on delete cascade,
  pair_id uuid not null references public.pairs(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  start integer not null check (start >= 0),
  "end" integer not null check ("end" > start),
  quote text not null,
  note text not null,
  created_at timestamptz not null default now(),
  unique (letter_id, user_id, start, "end")
);
create index annotation_replies_pair_idx on public.annotation_replies(pair_id, created_at);
alter table public.annotation_replies enable row level security;

create policy annotation_replies_select on public.annotation_replies for select to authenticated
using (exists (
  select 1 from public.letters l join public.pairs p on p.id = l.pair_id
  where l.id = letter_id and l.pair_id = annotation_replies.pair_id
    and l.status in ('delivered', 'read') and auth.uid() in (p.user_a, p.user_b)
));
create policy annotation_replies_insert on public.annotation_replies for insert to authenticated
with check (user_id = auth.uid() and exists (
  select 1 from public.letters l join public.pairs p on p.id = l.pair_id
  where l.id = letter_id and l.pair_id = annotation_replies.pair_id
    and l.status in ('delivered', 'read') and p.status = 'paired'
    and l.sender_id <> auth.uid() and auth.uid() in (p.user_a, p.user_b)
    and public.valid_letter_annotations(l.content, jsonb_build_array(jsonb_build_object(
      'id', annotation_replies.id, 'start', annotation_replies.start, 'end', annotation_replies."end",
      'quote', annotation_replies.quote, 'note', annotation_replies.note
    )))
));
revoke all on public.annotation_replies from public, anon, authenticated;
grant select, insert on public.annotation_replies to authenticated;

alter publication supabase_realtime add table public.annotation_replies;
commit;
