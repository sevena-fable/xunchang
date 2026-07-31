-- ============================================
-- 「一羽」阶段六建表脚本：信里的图片 + 回应系统
-- 使用方法：复制整个文件内容，粘贴到 Supabase 的
-- SQL Editor 里，点 Run 运行一次即可
-- ============================================

-- ========== 1. 信里可以带图片 ==========
-- images 存一个数组，里面是图片的公开网址（上传到 Storage 后拿到的链接）
-- 用 jsonb 而不是 text[]，是因为前端 JS 传数组给 jsonb 最省事
alter table public.letters
  add column if not exists images jsonb not null default '[]'::jsonb;

-- ========== 2. reactions 回应表 ==========
-- 规则 5：只有收信人能回应，一封信只能回应一次，回应后不可修改
create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  letter_id uuid not null unique references public.letters (id) on delete cascade,
  pair_id uuid not null references public.pairs (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  emoji text check (emoji in ('coffee', 'heart', 'thumb', 'dog')),  -- 四种表情，可为空
  note text check (char_length(note) <= 20),                         -- 20 字以内短评，可为空
  created_at timestamptz not null default now()
);

-- letter_id 上的 unique 已自带索引；这里再加一个按空间查的索引
create index if not exists reactions_pair_idx on public.reactions (pair_id);

-- ========== 门禁规则（RLS）==========
alter table public.reactions enable row level security;

-- 查看：空间成员都能看到回应（写信人当然要看得到对方的回应）
create policy "reactions: 成员可查看"
  on public.reactions for select
  using (
    exists (
      select 1 from public.pairs p
      where p.id = pair_id
        and ((select auth.uid()) in (p.user_a, p.user_b))
    )
  );

-- 新增：必须是自己的名义、必须是空间成员，
-- 并且这封信不能是自己写的（规则 5：不能回应自己写的信）
create policy "reactions: 收信人可回应"
  on public.reactions for insert
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.pairs p
      where p.id = pair_id
        and ((select auth.uid()) in (p.user_a, p.user_b))
    )
    and exists (
      select 1 from public.letters l
      where l.id = letter_id
        and l.pair_id = reactions.pair_id
        and l.sender_id <> (select auth.uid())
    )
  );

-- 故意不写 update / delete 策略：
-- 没有策略 = 谁都改不了、删不掉，数据库层面保证"回应一次性、不可修改"

-- ========== 开启实时推送：对方一回应，我这边立刻看到 ==========
alter publication supabase_realtime add table public.reactions;

-- ============================================
-- 3. Storage：存信里的图片
-- ============================================
-- 建一个公开读取的存储桶。公开读是为了让 <img src="..."> 能直接显示；
-- 写入权限在下面的策略里严格限制，别人无法往你的目录里塞东西。
insert into storage.buckets (id, name, public)
values ('letter-images', 'letter-images', true)
on conflict (id) do nothing;

-- 上传：登录用户只能往「以自己 id 命名的文件夹」里上传
create policy "letter-images: 本人可上传"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'letter-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- 删除：只能删自己文件夹里的（写信时误传了想撤回）
create policy "letter-images: 本人可删除"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'letter-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- 读取：桶是 public 的，任何人拿到链接都能看图（图片链接本身是随机路径，不可枚举）
create policy "letter-images: 公开可读"
  on storage.objects for select
  using (bucket_id = 'letter-images');
