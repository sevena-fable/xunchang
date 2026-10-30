-- 取消普通文字回应的旧 20 字限制，保留内容、权限和每条一次的约束。
begin;
alter table public.reactions drop constraint if exists reactions_note_check;
commit;
