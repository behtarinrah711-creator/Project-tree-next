import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('member lifecycle controls stay in the list and vary by status',async()=>{
  const source=await readFile(new URL('./index.js',import.meta.url),'utf8');
  assert.match(source,/member\.status==='invited'.*'ارسال مجدد دعوت‌نامه'.*'حذف دعوت‌نامه'/s);
  assert.match(source,/member\.status==='active'.*'غیرفعال‌سازی'.*'حذف'/s);
  assert.match(source,/member\.status==='inactive'.*'فعال‌سازی'.*'حذف'/s);
  assert.match(source,/member\.status==='deleted'.*'ارسال دعوت‌نامه'/s);
  assert.match(source,/cancelInvitation[\s\S]*removeMember\(projectId,member\)[\s\S]*'دعوت‌نامه حذف شد\.'/);
  assert.doesNotMatch(source,/fields\.appendChild\(resend\)/);
});

test('an invitation present only on the server is restored to the member list',async()=>{
  const source=await readFile(new URL('./index.js',import.meta.url),'utf8');
  assert.match(source,/invitation\.alreadyInvited/);
  assert.match(source,/این کاربر قبلاً دعوت شده است/);
  assert.match(source,/permissions:normalizePermissions\(invitation\.permissions \|\| member\.permissions,registry\)/);
});

test('a duplicate pending invitation uses the system toast instead of an inline keyboard-hidden error',async()=>{
  const source=await readFile(new URL('./index.js',import.meta.url),'utf8');
  assert.match(source,/duplicate\.status==='invited'\) windowRef\?\.KarhaToast\?\.show\?\.\(message\)/);
});

test('cancelling an invitation removes every stale local row for the same phone',async()=>{
  const source=await readFile(new URL('./index.js',import.meta.url),'utf8');
  assert.match(source,/projectMembers\.filter\(item=>item\.mobile!==member\.mobile\)/);
});
