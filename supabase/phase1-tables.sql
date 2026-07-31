-- ============================================
-- 「一羽」阶段一建表脚本
-- 使用方法：复制整个文件内容，粘贴到 Supabase 的
-- SQL Editor 里，点 Run 运行一次即可
-- ============================================

-- ========== 1. profiles 用户资料表 ==========
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null default '',
  created_at timestamptz not null default now()
);

-- ========== 2. pairs 配对空间表 ==========
create table public.pairs (
  id uuid primary key default gen_random_uuid(),
  invite_code text unique not null,
  user_a uuid not null references public.profiles (id),
  user_b uuid references public.profiles (id),
  status text not null default 'waiting' check (status in ('waiting', 'paired')),
  created_at timestamptz not null default now()
);

-- ========== 3. pigeons 信鸽表 ==========
create table public.pigeons (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid unique not null references public.pairs (id) on delete cascade,
  name text not null default '',
  call_for_a text not null default '',
  call_for_b text not null default '',
  location text not null default 'a_window' check (location in ('a_window', 'b_window')),
  state text not null default 'idle' check (state in ('idle', 'delivering', 'guarding')),
  guarding_letter_id uuid,
  updated_at timestamptz not null default now()
);

-- ============================================
-- 门禁规则（RLS）：先给每张表上锁，再逐条开门
-- ============================================
alter table public.profiles enable row level security;
alter table public.pairs enable row level security;
alter table public.pigeons enable row level security;

-- ---------- profiles 的门禁 ----------
-- 自己可以创建自己的资料
create policy "profiles: 本人可创建"
  on public.profiles for insert
  with check (id = (select auth.uid()));

-- 自己和配对的另一半可以查看资料（对方要能看到你的昵称）
create policy "profiles: 本人与配对方可查看"
  on public.profiles for select
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.pairs p
      where (p.user_a = profiles.id or p.user_b = profiles.id)
        and ((select auth.uid()) in (p.user_a, p.user_b))
    )
  );

-- 只有本人能修改自己的资料
create policy "profiles: 本人可修改"
  on public.profiles for update
  using (id = (select auth.uid()));

-- ---------- pairs 的门禁 ----------
-- 登录用户可以创建空间，但创建者必须是自己
create policy "pairs: 创建者本人可建立"
  on public.pairs for insert
  with check (user_a = (select auth.uid()));

-- 只有空间里的两个人能查看这个空间
create policy "pairs: 成员可查看"
  on public.pairs for select
  using ((select auth.uid()) in (user_a, user_b));

-- ---------- pigeons 的门禁 ----------
-- 只有空间成员能创建、查看、更新鸽子
create policy "pigeons: 成员可创建"
  on public.pigeons for insert
  with check (
    exists (
      select 1 from public.pairs p
      where p.id = pair_id
        and ((select auth.uid()) in (p.user_a, p.user_b))
    )
  );

create policy "pigeons: 成员可查看"
  on public.pigeons for select
  using (
    exists (
      select 1 from public.pairs p
      where p.id = pair_id
        and ((select auth.uid()) in (p.user_a, p.user_b))
    )
  );

create policy "pigeons: 成员可更新"
  on public.pigeons for update
  using (
    exists (
      select 1 from public.pairs p
      where p.id = pair_id
        and ((select auth.uid()) in (p.user_a, p.user_b))
    )
  );

-- ============================================
-- 特殊通道：凭邀请码加入空间
-- 为什么需要它：B 还不是空间成员，门禁不允许 B 看到
-- 或修改这个空间。所以做一个"守门人函数"，B 报上
-- 邀请码，由守门人验证后放行。
-- ============================================
create or replace function public.join_pair(code text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  target_pair public.pairs%rowtype;
begin
  -- 找到这个邀请码对应的、还在等待中的空间
  select * into target_pair
  from public.pairs
  where invite_code = code and status = 'waiting';

  if target_pair.id is null then
    raise exception '邀请码无效或空间已满';
  end if;

  -- 不能自己和自己配对
  if target_pair.user_a = auth.uid() then
    raise exception '不能加入自己创建的空间';
  end if;

  -- 正式入住：填上 user_b，状态改为已配对
  update public.pairs
  set user_b = auth.uid(), status = 'paired'
  where id = target_pair.id;

  return target_pair.id;
end;
$$;
