import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('member lifecycle controls stay in the list and vary by status',async()=>{
  const source=await readFile(new URL('./index.js',import.meta.url),'utf8');
  assert.match(source,/member\.status==='invited'.*'ارسال مجدد دعوت‌نامه'.*'حذف دعوت‌نامه'/s);
  assert.match(source,/member\.status==='active'.*'غیرفعال‌سازی'.*'حذف'/s);
  assert.match(source,/member\.status==='inactive'.*'فعال‌سازی'.*'حذف'/s);
  assert.match(source,/member\.status==='deleted'.*'ارسال دعوت‌نامه'/s);
  assert.match(source,/cancelInvitation[\s\S]*'دعوت‌نامه حذف شد\.'/);
  assert.doesNotMatch(source,/fields\.appendChild\(resend\)/);
});
