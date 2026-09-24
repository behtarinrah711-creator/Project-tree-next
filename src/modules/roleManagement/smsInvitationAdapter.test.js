import test from 'node:test';
import assert from 'node:assert/strict';
import { createSmsInvitationAdapter } from './smsInvitationAdapter.js';

test('default SMS adapter is explicitly inert and never fakes delivery',async()=>{
  const adapter=createSmsInvitationAdapter();
  assert.equal(adapter.configured,false);
  assert.deepEqual(await adapter.sendInvitation({mobile:'09123456789'}),{sent:false,reason:'provider-not-configured'});
});
