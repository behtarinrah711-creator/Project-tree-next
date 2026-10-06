import test from 'node:test';
import assert from 'node:assert/strict';
import {INVITATION_LIFETIME_DAYS,INVITATION_RESEND_COOLDOWN_SECONDS,OTP_LIFETIME_SECONDS,invitationResendRetryAfter,normalizeEmail,normalizeIranPhone} from '../src/app.js';

test('login OTP and project invitation keep independent lifetimes',()=>{
  assert.equal(OTP_LIFETIME_SECONDS,180);
  assert.equal(INVITATION_LIFETIME_DAYS,7);
});

test('authentication and invitation accept only exact Iranian mobile format',()=>{
  assert.equal(normalizeIranPhone('09171009965'),'09171009965');
  for(const invalid of ['+989171009965','989171009965','9171009965','0917 100 9965','۰۹۱۷۱۰۰۹۹۶۵']){
    assert.equal(normalizeIranPhone(invalid),null);
  }
});

test('optional invitation email is normalized and validated',()=>{
  assert.equal(normalizeEmail(' User@Example.COM '),'user@example.com');
  assert.equal(normalizeEmail(''),'');
  assert.equal(normalizeEmail('not-an-email'),null);
});

test('invitation resend is blocked while the previous SMS can still be in the carrier queue',()=>{
  const now=Date.parse('2026-10-07T00:00:00Z');
  assert.equal(INVITATION_RESEND_COOLDOWN_SECONDS,300);
  assert.equal(invitationResendRetryAfter('2026-10-06T23:59:00Z',now),240);
  assert.equal(invitationResendRetryAfter('2026-10-06T23:55:00Z',now),0);
  assert.equal(invitationResendRetryAfter(null,now),0);
});
