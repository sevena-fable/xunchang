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
    await db.exec(await sqlFile('migrations/20261024005756_letter_annotations.sql'))
    const beforeLimitRemoval = await db.query('select * from public.letters order by id')
    const removeLimit = await sqlFile('migrations/20261029053457_remove_annotation_limit.sql')
    await db.exec(removeLimit)
    await db.exec(removeLimit)
    assert.deepEqual(await db.query('select * from public.letters order by id'), beforeLimitRemoval)
    assert.deepEqual((await db.query('select annotations from public.letters')).rows, [{ annotations: [] }, { annotations: [] }])
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

    const content = '甲🐦é乙'
    const item = { id: A, start: 1, end: 4, quote: '🐦é', note: '长批注\n'.repeat(10000) }
    const second = { id: B, start: 4, end: 5, quote: '乙', note: 'v' }
    const annotated = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
    const insert = (items, sender = A, id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee') => db.query(
      'insert into public.letters(id,pair_id,sender_id,content,annotations) values ($1,$2,$3,$4,$5::jsonb)',
      [id, PAIR, sender, content, JSON.stringify(items)],
    )
    await asUser(A)
    const metadata = (await db.query(`select provolatile, prosecdef, proconfig from pg_proc where oid='public.valid_letter_annotations(text,jsonb)'::regprocedure`)).rows[0]
    assert.equal(metadata.provolatile, 'i')
    assert.equal(metadata.prosecdef, false)
    assert.deepEqual(metadata.proconfig, ['search_path=pg_catalog'])
    const invalid = [null, {}, 'text', 42, true, [null], [1], [[]], [{}], [{ ...item, id: 'wrong' }], [{ ...item, start: -1 }], [{ ...item, start: '1' }], [{ ...item, start: 1.5 }], [{ ...item, start: null }], [{ ...item, end: 1 }], [{ ...item, end: 1e30 }], [{ ...item, end: 6 }], [{ ...item, quote: '甲' }], [{ ...item, note: 1 }], [{ ...item, note: null }], [item, item], [second, item], [item, { ...second, start: 3 }]]
    const whitespace = ' \t\n\r\f\v\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'
    for (const note of ['', ...whitespace]) invalid.push([{ ...item, note }])
    for (const field of ['id', 'start', 'end', 'quote', 'note']) {
      const missing = { ...item }; delete missing[field]; invalid.push([missing])
    }
    for (const items of invalid) await assert.rejects(insert(items), { code: '23514' })
    await assert.rejects(db.query('insert into public.letters(pair_id,sender_id,content,annotations) values ($1,$2,$3,null)', [PAIR, A, content]), { code: '23502' })
    for (const note of ['v', '🐦'.repeat(101), 'é'.repeat(5000), '\u0085', '\u200b', '\t有效\n']) {
      assert.equal((await db.query('select public.valid_letter_annotations($1,$2::jsonb) as valid', [content, JSON.stringify([{ ...item, note }])])).rows[0].valid, true)
    }
    assert.equal((await db.query('select public.valid_letter_annotations($1,$2::jsonb) as valid', [' ', JSON.stringify([{ ...item, start: 0, end: 1, quote: ' ', note: '说明' }])])).rows[0].valid, false)
    await insert([item, second], A, annotated)
    await assert.rejects(db.query('update public.letters set annotations=$1::jsonb where id=$2', ['[]', annotated]), { code: '42501' })
    await asUser(B)
    assert.equal((await db.query('select annotations from public.letters where id=$1', [annotated])).rows.length, 0)
    await assert.rejects(db.query('select public.mark_letter_read($1)', [annotated]))
    await assert.rejects(insert([item]))
    await asUser(C)
    assert.equal((await db.query('select annotations from public.letters where id=$1', [annotated])).rows.length, 0)
    await assert.rejects(insert([item], C))
    await asUser(null, 'anon')
    await assert.rejects(db.query('select annotations from public.letters'), { code: '42501' })
    await assert.rejects(db.query('select public.valid_letter_annotations($1,$2::jsonb)', [content, JSON.stringify([item])]), { code: '42501' })
    await assert.rejects(insert([item]))
    await asUser(A)
    await db.query('select public.deliver_sealed_letter($1)', [annotated])
    await asUser(B)
    assert.deepEqual((await db.query('select annotations from public.letters where id=$1', [annotated])).rows[0].annotations, [item, second])
    await db.query('select public.mark_letter_read($1)', [annotated])
    await assert.rejects(db.query('update public.letters set annotations=$1::jsonb where id=$2', ['[]', annotated]), { code: '42501' })
    await asUser(A)
    assert.deepEqual((await db.query('select status,annotations from public.letters where id=$1', [annotated])).rows[0], { status: 'read', annotations: [item, second] })
    // Reply ranges may overlap the author's notes, but only the recipient can
    // insert them and neither participant can rewrite shared text or replies.
    await db.exec('reset role')
    await db.exec(await sqlFile('migrations/20261030090000_annotation_replies.sql'))
    const replyId = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
    const addReply = (overrides = {}) => {
      const record = { id: replyId, letter: annotated, pair: PAIR, user: B, start: 1, end: 4, quote: '🐦é', note: '回复原文'.repeat(1000), ...overrides }
      return db.query('insert into public.annotation_replies(id,letter_id,pair_id,user_id,start,"end",quote,note) values ($1,$2,$3,$4,$5,$6,$7,$8)', Object.values(record))
    }
    await asUser(A)
    await assert.rejects(addReply({ user: A }))
    await asUser(C)
    await assert.rejects(addReply({ user: C }))
    await asUser(B)
    await assert.rejects(addReply({ user: A }))
    await assert.rejects(addReply({ letter: SEALED }))
    await assert.rejects(addReply({ pair: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' }))
    for (const invalid of [{ quote: 'wrong' }, { start: -1 }, { end: 100 }, { note: '  ' }, { end: 1 }]) await assert.rejects(addReply(invalid))
    await addReply()
    assert.equal((await db.query('select * from public.annotation_replies')).rows.length, 1)
    await assert.rejects(addReply({ id: 'ffffffff-ffff-4fff-8fff-fffffffffffe' }))
    await assert.rejects(db.query('update public.annotation_replies set note=$1 where id=$2', ['changed', replyId]))
    await assert.rejects(db.query('delete from public.annotation_replies where id=$1', [replyId]))
    await asUser(A)
    assert.equal((await db.query('select * from public.annotation_replies')).rows.length, 1)
    assert.deepEqual((await db.query('select annotations from public.letters where id=$1', [annotated])).rows[0].annotations, [item, second])
    await asUser(C)
    assert.equal((await db.query('select * from public.annotation_replies')).rows.length, 0)
    await asUser(null, 'anon')
    await assert.rejects(db.query('select * from public.annotation_replies'))
    await assert.rejects(addReply())
    await asUser(B)
    const longReaction = '普通回应可以超过二十字，也保留换行。\n'.repeat(200)
    const addLongReaction = () => db.query('insert into public.reactions(letter_id,pair_id,user_id,note) values ($1,$2,$3,$4)', [annotated, PAIR, B, longReaction])
    await assert.rejects(addLongReaction(), { code: '23514' })
    await db.exec('reset role')
    const removeReactionLimit = await sqlFile('migrations/20261030100000_remove_reaction_note_limit.sql')
    await db.exec(removeReactionLimit)
    await db.exec(removeReactionLimit)
    await asUser(B)
    await addLongReaction()
    await assert.rejects(addLongReaction())
    await asUser(A)
    assert.equal((await db.query('select note from public.reactions where letter_id=$1', [annotated])).rows[0].note, longReaction)
    await assert.rejects(db.query('update public.reactions set note=$1 where letter_id=$2', ['changed', annotated]))
    await asUser(C)
    assert.equal((await db.query('select note from public.reactions where letter_id=$1', [annotated])).rows.length, 0)
  } finally { await db.close() }
})
