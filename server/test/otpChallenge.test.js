import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const readApp=()=>readFile(new URL('../src/app.js',import.meta.url),'utf8');

test('a successfully sent OTP invalidates every prior code for the same phone',async()=>{
  const app=await readApp();
  const lock=app.indexOf("SELECT pg_advisory_xact_lock(hashtext($1))");
  const invalidate=app.indexOf("UPDATE otp_challenges SET consumed_at = now() WHERE phone = $1 AND id <> $2");
  const activateLatest=app.indexOf("UPDATE otp_challenges SET consumed_at = NULL WHERE id = $1");
  assert.ok(lock>=0);
  assert.ok(invalidate>lock);
  assert.ok(activateLatest>invalidate);
  assert.match(app,/await sendLoginCode\(phone, code\);[\s\S]*pg_advisory_xact_lock/);
});
