-- ============================================
-- 「寻常」阶段二建表脚本：letters 信件表
-- 使用方法：复制整个文件，粘贴到 Supabase 的
-- SQL Editor 里，点 Run 运行一次即可
-- ============================================

-- ========== letters 信件表 ==========
create table public.letters (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.pairs (id) on delete cascade,
  sender_id uuid not null references public.profiles (id),
  content text not null default '',
  stationery text not null default 'cream',   -- 信纸款式：cream 米白 / sky 淡蓝 / kraft 牛皮纸 / night 夜空
  status text not null default 'sealed'
    check (status in ('sealed', 'delivering', 'delivered', 'read')),
  sealed_at timestamptz not null default now(),
  delivered_at timestamptz,
  read_at timestamptz
);

-- 让"按空间查信、按时间排序"更快
create index letters_pair_id_idx on public.letters (pair_id, sealed_at desc);

-- ========== 门禁规则（RLS）==========
alter table public.letters enable row level security;

-- 查看：只有空间成员能看这个空间的信
create policy "letters: 成员可查看"
  on public.letters for select
  using (
    exists (
      select 1 from public.pairs p
      where p.id = pair_id
        and ((select auth.uid()) in (p.user_a, p.user_b))
    )
  );

-- 写信：必须是空间成员，且写信人必须是自己
create policy "letters: 成员可写信"
  on public.letters for insert
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.pairs p
      where p.id = pair_id
        and ((select auth.uid()) in (p.user_a, p.user_b))
    )
  );

-- 更新：空间成员可更新（用于改状态：寄出、送达、已读）
create policy "letters: 成员可更新状态"
  on public.letters for update
  using (
    exists (
      select 1 from public.pairs p
      where p.id = pair_id
        and ((select auth.uid()) in (p.user_a, p.user_b))
    )
  );

-- ========== 开启 Realtime 实时推送 ==========
-- 这样对方在线时，新信 / 状态变化会自动推送到前端
alter publication supabase_realtime add table public.letters;
