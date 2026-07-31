-- ============================================
-- 「一羽」阶段三建表脚本：信鸽状态机
-- 使用方法：复制整个文件内容，粘贴到 Supabase 的
-- SQL Editor 里，点 Run 运行一次即可
-- ============================================

-- ========== 1. 给 pigeons 表加"溜达时间锚点" ==========
-- last_stroll_at：上一次结算溜达的时间。
-- 我们没有一直开着的后台服务器，所以鸽子的"自主溜达"用惰性结算：
-- 谁打开页面，就由谁根据"距上次溜达过了多久"一次性算出鸽子现在该在哪。
alter table public.pigeons
  add column if not exists last_stroll_at timestamptz not null default now();

-- ========== 2. summon_requests 召唤请求表 ==========
-- 摇铃召唤鸽子时，如果对方在线，需要对方点"同意"才能把鸽子唤回。
-- 这张表就是一次召唤请求的凭据：谁发起的、现在什么状态。
create table public.summon_requests (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.pairs (id) on delete cascade,
  requester_id uuid not null references public.profiles (id),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index summon_requests_pair_idx
  on public.summon_requests (pair_id, created_at desc);

-- ============================================
-- 门禁规则（RLS）
-- ============================================
alter table public.summon_requests enable row level security;

-- 只有空间成员能查看本空间的召唤请求
create policy "summon: 成员可查看"
  on public.summon_requests for select
  using (
    exists (
      select 1 from public.pairs p
      where p.id = pair_id
        and ((select auth.uid()) in (p.user_a, p.user_b))
    )
  );

-- 只有本人能以自己的名义发起召唤（且必须是空间成员）
create policy "summon: 本人可发起"
  on public.summon_requests for insert
  with check (
    requester_id = (select auth.uid())
    and exists (
      select 1 from public.pairs p
      where p.id = pair_id
        and ((select auth.uid()) in (p.user_a, p.user_b))
    )
  );

-- 空间成员可更新（发起人可取消；被召唤方可同意/拒绝）
create policy "summon: 成员可更新"
  on public.summon_requests for update
  using (
    exists (
      select 1 from public.pairs p
      where p.id = pair_id
        and ((select auth.uid()) in (p.user_a, p.user_b))
    )
  );

-- ============================================
-- 开启实时推送：对方发起/响应召唤时，本端立刻收到
-- ============================================
alter publication supabase_realtime add table public.summon_requests;
