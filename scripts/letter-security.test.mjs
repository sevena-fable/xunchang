import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
const C = '33333333-3333-3333-3333-333333333333'
const D = '44444444-4444-4444-4444-444444444444'
const PAIR = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SEALED = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const SENT = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const sqlFile = async (name) => (await readFile(new URL(`../supabase/${name}`, import.meta.url), 'utf8')).replace(/^alter publication .*;$/gm, '')

test('migration and RLS enforce private letters, images, reactions and pairing', { timeout: 60000 }, async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
      alter table storage.objects enable row level security;
      create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1, '/') $$;
      grant usage on schema public, auth, storage to anon, authenticated;
      grant select, insert, update, delete on storage.objects to anon, authenticated;
    `)
    for (const file of ['phase1-tables.sql', 'phase2-letters.sql', 'phase6-extras.sql']) await db.exec(await sqlFile(file))
    await db.exec(`
      insert into auth.users values ('${A}'), ('${B}'), ('${C}'), ('${D}');
      insert into public.profiles(id) select id from auth.users;
      insert into public.pairs(id, invite_code, user_a, user_b, status) values ('${PAIR}', 'ABCDEF', '${A}', '${B}', 'paired');
      insert into public.letters(id, pair_id, sender_id, content, status, images, delivered_at) values
        ('${SEALED}', '${PAIR}', '${A}', 'private draft', 'sealed', '["https://axbafzecdynaghgxeodt.supabase.co/storage/v1/object/public/letter-images/${A}/draft.jpg"]', null),
        ('${SENT}', '${PAIR}', '${A}', 'sent letter', 'delivered', '["${A}/sent.jpg"]', now());
      insert into storage.objects(bucket_id,name) values ('letter-images','${A}/draft.jpg'),('letter-images','${A}/sent.jpg'),('letter-images','${A}/unattached.jpg');
      grant select, insert, update, delete on all tables in schema public to authenticated;
      create policy broad_storage_read on storage.objects for select using (true);
    `)
    const migration = await sqlFile('phase7-reliability.sql')
    await db.exec(migration)
    await db.exec(migration)
    assert.deepEqual((await db.query(`select public, file_size_limit::integer, allowed_mime_types from storage.buckets where id='letter-images'`)).rows, [
      { public: false, file_size_limit: 6291456, allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] },
    ])
    async function asUser(id, role = 'authenticated') {
      await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub', '${id || ''}', false);`)
    }
    await asUser(B)
    assert.equal((await db.query('select * from public.letters')).rows.length, 1)
    assert.deepEqual((await db.query('select name from storage.objects')).rows.map((row) => row.name), [`${A}/sent.jpg`])
    await assert.rejects(db.exec(`insert into storage.objects(bucket_id,name) values ('letter-images','${A}/forged.jpg')`))
    assert.equal((await db.query(`update storage.objects set name='${B}/stolen.jpg' where name='${A}/sent.jpg' returning *`)).rows.length, 0)
    assert.equal((await db.query(`delete from storage.objects where name='${A}/sent.jpg' returning *`)).rows.length, 0)
    await assert.rejects(db.exec(`update public.letters set content='tampered' where id='${SENT}'`))
    await assert.rejects(db.exec(`select public.deliver_sealed_letter('${SEALED}')`))
    await assert.rejects(db.exec(`insert into public.reactions(letter_id,pair_id,user_id,note) values ('${SEALED}','${PAIR}','${B}','too early')`))
    await db.exec(`select public.mark_letter_read('${SENT}'); select public.mark_letter_read('${SENT}');`)
    await db.exec(`insert into public.reactions(letter_id,pair_id,user_id,note) values ('${SENT}','${PAIR}','${B}','received')`)
    await assert.rejects(db.exec(`insert into public.reactions(letter_id,pair_id,user_id,note) values ('${SENT}','${PAIR}','${B}','again')`))
    await assert.rejects(db.exec(`insert into public.letters(pair_id,sender_id,content,status,delivered_at,images) values ('${PAIR}','${B}','x','delivered',now(),'["${A}/sent.jpg"]')`))
    await asUser(C)
    assert.equal((await db.query('select * from public.letters')).rows.length, 0)
    assert.equal((await db.query('select * from public.reactions')).rows.length, 0)
    assert.equal((await db.query('select * from storage.objects')).rows.length, 0)
    await assert.rejects(db.exec(`insert into storage.objects(bucket_id,name) values ('letter-images','${A}/forged.jpg')`))
    await assert.rejects(db.exec(`select public.mark_letter_read('${SENT}')`))
    await asUser(null, 'anon')
    assert.equal((await db.query('select * from storage.objects')).rows.length, 0)
    await assert.rejects(db.query('select * from public.letters'))
    await assert.rejects(db.query('select * from public.reactions'))
    await assert.rejects(db.exec(`insert into storage.objects(bucket_id,name) values ('letter-images','${A}/anonymous.jpg')`))
    await assert.rejects(db.exec(`select public.mark_letter_read('${SENT}')`))
    await assert.rejects(db.exec(`select public.private_letter_images_ready()`))
    await assert.rejects(db.exec(`select public.join_pair('ABCDEF')`))
    await asUser(A)
    assert.equal((await db.query('select public.private_letter_images_ready() as ready')).rows[0].ready, true)
    assert.equal((await db.query('select * from public.letters')).rows.length, 2)
    assert.deepEqual((await db.query('select name from storage.objects order by name')).rows.map((row) => row.name), [`${A}/draft.jpg`, `${A}/sent.jpg`, `${A}/unattached.jpg`])
    await db.exec(`insert into storage.objects(bucket_id,name) values ('letter-images','${A}/new.jpg')`)
    assert.equal((await db.query(`delete from storage.objects where name='${A}/new.jpg' returning *`)).rows.length, 1)
    assert.equal((await db.query(`update storage.objects set name='${A}/replacement.jpg' where name='${A}/sent.jpg' returning *`)).rows.length, 0)
    assert.equal((await db.query(`delete from storage.objects where name='${A}/sent.jpg' returning *`)).rows.length, 0)
    assert.equal((await db.query(`delete from storage.objects where name='${A}/unattached.jpg' returning *`)).rows.length, 1)
    await db.exec(`reset role; update storage.buckets set public=true where id='letter-images'`)
    await asUser(A)
    assert.equal((await db.query('select public.private_letter_images_ready() as ready')).rows[0].ready, false)
    await db.exec(`reset role; update storage.buckets set public=false where id='letter-images'`)
    await asUser(A)
    await assert.rejects(db.exec(`insert into public.pairs(invite_code,user_a) values ('UVWXYZ','${A}')`))
    await db.exec(`select public.deliver_sealed_letter('${SEALED}'); select public.deliver_sealed_letter('${SEALED}');`)
    await asUser(B)
    assert.equal((await db.query('select * from public.letters')).rows.length, 2)
    assert.equal((await db.query('select * from storage.objects')).rows.length, 2)
    await asUser(C)
    await db.exec(`insert into public.pairs(invite_code,user_a) values ('UVWXYZ','${C}')`)
    await asUser(D)
    await db.exec(`select public.join_pair('UVWXYZ')`)
    await assert.rejects(db.exec(`select public.join_pair('UVWXYZ')`))
  } finally { await db.close() }
})
