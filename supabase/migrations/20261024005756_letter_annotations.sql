begin;

create function public.valid_letter_annotations(body text, items jsonb)
returns boolean language plpgsql immutable security invoker set search_path = pg_catalog as $$
declare
  item jsonb;
  first_char numeric;
  last_char numeric;
  previous_end numeric := 0;
  ids text[] := '{}';
  whitespace text := E' \t\n\r\f' || chr(11) || chr(160) || chr(5760) || chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) || chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) || chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279);
begin
  if body is null or items is null or jsonb_typeof(items) <> 'array' then return false; end if;
  for item in select value from jsonb_array_elements(items) loop
    if jsonb_typeof(item) <> 'object'
      or jsonb_typeof(item->'id') is distinct from 'string'
      or jsonb_typeof(item->'start') is distinct from 'number'
      or jsonb_typeof(item->'end') is distinct from 'number'
      or jsonb_typeof(item->'quote') is distinct from 'string'
      or jsonb_typeof(item->'note') is distinct from 'string'
    then return false; end if;
    if (item->>'id') !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
      or (item->>'id') = any(ids)
      or char_length(btrim(item->>'note', whitespace)) = 0
      or char_length(item->>'note') > 100
      or char_length(btrim(item->>'quote', whitespace)) = 0
    then return false; end if;
    first_char := (item->>'start')::numeric;
    last_char := (item->>'end')::numeric;
    if first_char <> trunc(first_char) or last_char <> trunc(last_char)
      or first_char < previous_end or last_char <= first_char or last_char > char_length(body)
    then return false; end if;
    if substring(body from first_char::integer + 1 for (last_char - first_char)::integer) <> item->>'quote' then return false; end if;
    ids := array_append(ids, item->>'id');
    previous_end := last_char;
  end loop;
  return true;
end;
$$;
revoke all on function public.valid_letter_annotations(text, jsonb) from public, anon;
grant execute on function public.valid_letter_annotations(text, jsonb) to authenticated;

alter table public.letters add column annotations jsonb not null default '[]'::jsonb;
alter table public.letters add constraint letters_annotations_check check (public.valid_letter_annotations(content, annotations));

commit;
