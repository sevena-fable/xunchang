-- 先核对实际云端策略并备份；本脚本不删除信件、配对或图片，仅在人工确认后执行。
begin;

create or replace function public.valid_letter_images(items jsonb, owner_id uuid)
returns boolean language plpgsql immutable set search_path = pg_catalog as $$
declare item jsonb; path text;
begin
  if items is null or jsonb_typeof(items) <> 'array' then return false; end if;
  if jsonb_array_length(items) > 3 then return false; end if;
  for item in select value from jsonb_array_elements(items) loop
    if jsonb_typeof(item) <> 'string' then return false; end if;
    path := item #>> '{}';
    if split_part(path, '/', 1) <> owner_id::text
      or path !~ '^[a-f0-9-]{36}/[A-Za-z0-9._/-]+$'
      or path ~ '(^|/)(\.|\.\.)($|/)' or path like '%//%' or right(path, 1) = '/'
    then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.valid_letter_images(jsonb, uuid) from public, anon;
grant execute on function public.valid_letter_images(jsonb, uuid) to authenticated;

-- 只转换本项目的旧公共地址；其他来源保持原值，不授予额外访问权。
update public.letters l set images = (
  select jsonb_agg(case
    when item #>> '{}' like 'https://axbafzecdynaghgxeodt.supabase.co/storage/v1/object/public/letter-images/%'
      then to_jsonb(substr(item #>> '{}', length('https://axbafzecdynaghgxeodt.supabase.co/storage/v1/object/public/letter-images/') + 1))
    else item end order by position)
  from jsonb_array_elements(l.images) with ordinality as entries(item, position)
) where jsonb_typeof(l.images) = 'array' and jsonb_array_length(l.images) > 0;

create or replace function public.can_read_letter(sender uuid, space uuid, letter_status text)
returns boolean language sql stable set search_path = pg_catalog as $$
  select auth.uid() is not null
    and exists (select 1 from public.pairs p where p.id = space and auth.uid() in (p.user_a, p.user_b))
    and (sender = auth.uid() or letter_status in ('delivered', 'read'));
$$;
revoke all on function public.can_read_letter(uuid, uuid, text) from public, anon;
grant execute on function public.can_read_letter(uuid, uuid, text) to authenticated;

alter table public.letters enable row level security;
drop policy if exists "letters: 成员可查看" on public.letters;
drop policy if exists "letters: 成员可写信" on public.letters;
drop policy if exists "letters: 成员可更新状态" on public.letters;
drop policy if exists "letters_private_select" on public.letters;
drop policy if exists "letters_private_insert" on public.letters;
drop policy if exists "letters_select_guard" on public.letters;
drop policy if exists "letters_insert_guard" on public.letters;
drop policy if exists "letters_update_guard" on public.letters;
drop policy if exists "letters_delete_guard" on public.letters;
create policy "letters_private_select" on public.letters for select to authenticated
  using (public.can_read_letter(sender_id, pair_id, status));
create policy "letters_select_guard" on public.letters as restrictive for select to authenticated
  using (public.can_read_letter(sender_id, pair_id, status));
create policy "letters_private_insert" on public.letters for insert to authenticated
  with check (sender_id = auth.uid());
create policy "letters_insert_guard" on public.letters as restrictive for insert to authenticated
  with check (
    sender_id = auth.uid() and stationery = 'cream' and read_at is null
    and ((status = 'sealed' and delivered_at is null) or (status = 'delivered' and delivered_at is not null))
    and public.valid_letter_images(images, auth.uid())
    and (length(btrim(content)) > 0 or jsonb_array_length(images) > 0)
    and exists (select 1 from public.pairs p where p.id = pair_id and p.status = 'paired' and auth.uid() in (p.user_a, p.user_b))
  );
create policy "letters_update_guard" on public.letters as restrictive for update to authenticated using (false);
create policy "letters_delete_guard" on public.letters as restrictive for delete to authenticated using (false);
revoke all on public.letters from public, anon;
revoke update, delete on public.letters from authenticated;
grant select, insert on public.letters to authenticated;

create or replace function public.mark_letter_read(letter_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare target public.letters%rowtype;
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  select * into target from public.letters where id = letter_id for update;
  if not found or target.sender_id = auth.uid() or target.status not in ('delivered', 'read')
    or not exists (select 1 from public.pairs p where p.id = target.pair_id and auth.uid() in (p.user_a, p.user_b))
  then raise exception '无权标记这封信'; end if;
  update public.letters set status = 'read', read_at = coalesce(read_at, now()) where id = letter_id;
end;
$$;

create or replace function public.deliver_sealed_letter(letter_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare target public.letters%rowtype;
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  select * into target from public.letters where id = letter_id for update;
  if not found or target.sender_id <> auth.uid()
    or not exists (select 1 from public.pairs p where p.id = target.pair_id and p.status = 'paired' and auth.uid() in (p.user_a, p.user_b))
  then raise exception '无权寄出这封信'; end if;
  if target.status in ('delivered', 'read') then return; end if;
  if target.status not in ('sealed', 'delivering') then raise exception '信件状态不允许寄出'; end if;
  update public.letters set status = 'delivered', delivered_at = now() where id = letter_id;
end;
$$;
revoke all on function public.mark_letter_read(uuid), public.deliver_sealed_letter(uuid) from public, anon;
grant execute on function public.mark_letter_read(uuid), public.deliver_sealed_letter(uuid) to authenticated;

alter table public.reactions enable row level security;
drop policy if exists "reactions: 成员可查看" on public.reactions;
drop policy if exists "reactions: 收信人可回应" on public.reactions;
drop policy if exists "reactions_select" on public.reactions;
drop policy if exists "reactions_select_guard" on public.reactions;
drop policy if exists "reactions_insert" on public.reactions;
drop policy if exists "reactions_insert_guard" on public.reactions;
drop policy if exists "reactions_update_guard" on public.reactions;
drop policy if exists "reactions_delete_guard" on public.reactions;
create policy "reactions_select" on public.reactions for select to authenticated using (true);
create policy "reactions_select_guard" on public.reactions as restrictive for select to authenticated using (
  exists (select 1 from public.letters l where l.id = letter_id and l.pair_id = reactions.pair_id and l.status in ('delivered', 'read'))
);
create policy "reactions_insert" on public.reactions for insert to authenticated with check (user_id = auth.uid());
create policy "reactions_insert_guard" on public.reactions as restrictive for insert to authenticated with check (
  user_id = auth.uid() and (emoji is not null or length(btrim(note)) > 0)
  and exists (select 1 from public.letters l where l.id = letter_id and l.pair_id = reactions.pair_id and l.sender_id <> auth.uid() and l.status in ('delivered', 'read'))
);
create policy "reactions_update_guard" on public.reactions as restrictive for update to authenticated using (false);
create policy "reactions_delete_guard" on public.reactions as restrictive for delete to authenticated using (false);
revoke all on public.reactions from public, anon;
revoke update, delete on public.reactions from authenticated;
grant select, insert on public.reactions to authenticated;

update storage.buckets set public = false, file_size_limit = 6291456,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'letter-images';

create or replace function public.letter_image_attached(object_path text)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select exists (select 1 from public.letters l where l.images ? object_path);
$$;
create or replace function public.can_read_letter_image(object_path text)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select auth.uid() is not null and (
    (split_part(object_path, '/', 1) = auth.uid()::text and not public.letter_image_attached(object_path))
    or exists (
      select 1 from public.letters l join public.pairs p on p.id = l.pair_id
      where l.images ? object_path and auth.uid() in (p.user_a, p.user_b)
        and split_part(object_path, '/', 1) = l.sender_id::text
        and (l.sender_id = auth.uid() or l.status in ('delivered', 'read'))
    )
  );
$$;
create or replace function public.can_delete_letter_image(object_path text)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select auth.uid() is not null and split_part(object_path, '/', 1) = auth.uid()::text
    and not public.letter_image_attached(object_path);
$$;
revoke all on function public.letter_image_attached(text) from public, anon, authenticated;
revoke all on function public.can_read_letter_image(text), public.can_delete_letter_image(text) from public;
grant execute on function public.can_read_letter_image(text), public.can_delete_letter_image(text) to anon, authenticated;

drop policy if exists "letter-images: 公开可读" on storage.objects;
drop policy if exists "letter-images: 本人可上传" on storage.objects;
drop policy if exists "letter-images: 本人可删除" on storage.objects;
drop policy if exists "letter_images_select" on storage.objects;
drop policy if exists "letter_images_insert" on storage.objects;
drop policy if exists "letter_images_delete" on storage.objects;
drop policy if exists "letter_images_select_guard" on storage.objects;
drop policy if exists "letter_images_insert_guard" on storage.objects;
drop policy if exists "letter_images_update_guard" on storage.objects;
drop policy if exists "letter_images_delete_guard" on storage.objects;
create policy "letter_images_select" on storage.objects for select to authenticated using (bucket_id = 'letter-images' and public.can_read_letter_image(name));
create policy "letter_images_insert" on storage.objects for insert to authenticated with check (bucket_id = 'letter-images' and split_part(name, '/', 1) = auth.uid()::text);
create policy "letter_images_delete" on storage.objects for delete to authenticated using (bucket_id = 'letter-images' and public.can_delete_letter_image(name));
create policy "letter_images_select_guard" on storage.objects as restrictive for select to public
  using (case when bucket_id <> 'letter-images' then true when auth.uid() is null then false else public.can_read_letter_image(name) end);
create policy "letter_images_insert_guard" on storage.objects as restrictive for insert to public
  with check (bucket_id <> 'letter-images' or (auth.uid() is not null and split_part(name, '/', 1) = auth.uid()::text));
create policy "letter_images_update_guard" on storage.objects as restrictive for update to public
  using (bucket_id <> 'letter-images') with check (bucket_id <> 'letter-images');
create policy "letter_images_delete_guard" on storage.objects as restrictive for delete to public
  using (case when bucket_id <> 'letter-images' then true when auth.uid() is null then false else public.can_delete_letter_image(name) end);

create or replace function public.private_letter_images_ready()
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select auth.uid() is not null and exists (select 1 from storage.buckets where id = 'letter-images' and not public);
$$;
revoke all on function public.private_letter_images_ready() from public, anon;
grant execute on function public.private_letter_images_ready() to authenticated;

create or replace function public.guard_pair_creation()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if auth.uid() is null or new.user_a <> auth.uid() or new.user_b is not null or new.status <> 'waiting' then raise exception '只能为自己建立等待中的空间'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  if exists (select 1 from public.pairs where auth.uid() in (user_a, user_b)) then raise exception '你已经有一个空间了'; end if;
  return new;
end;
$$;
revoke all on function public.guard_pair_creation() from public, anon, authenticated;
drop trigger if exists guard_pair_creation on public.pairs;
create trigger guard_pair_creation before insert on public.pairs for each row execute function public.guard_pair_creation();

create or replace function public.join_pair(code text)
returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare target public.pairs%rowtype;
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid()) then raise exception '请先完成用户资料'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  if exists (select 1 from public.pairs where auth.uid() in (user_a, user_b)) then raise exception '你已经有一个空间了'; end if;
  select * into target from public.pairs where invite_code = upper(btrim(code)) for update;
  if not found or target.status <> 'waiting' or target.user_b is not null then raise exception '邀请码无效或空间已满'; end if;
  if target.user_a = auth.uid() then raise exception '不能加入自己创建的空间'; end if;
  update public.pairs set user_b = auth.uid(), status = 'paired'
    where id = target.id and status = 'waiting' and user_b is null;
  if not found then raise exception '空间已满'; end if;
  return target.id;
end;
$$;
revoke all on function public.join_pair(text) from public, anon;
grant execute on function public.join_pair(text) to authenticated;
revoke update, delete on public.pairs from anon, authenticated;

commit;
