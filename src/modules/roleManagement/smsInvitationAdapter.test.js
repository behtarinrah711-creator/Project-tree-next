import test from 'node:test';
import assert from 'node:assert/strict';
import { createSmsInvitationAdapter } from './smsInvitationAdapter.js';

test('default SMS adapter is explicitly inert and never fakes delivery',async()=>{
  const adapter=createSmsInvitationAdapter({windowRef:{location:{hostname:'localhost'}}});
  assert.equal(adapter.configured,false);
  assert.deepEqual(await adapter.sendInvitation({member:{mobile:'09123456789'}}),{sent:false,reason:'provider-not-configured'});
});

test('Saosa adapter sends phone and optional email as one invitation',async()=>{
  const calls=[];
  const windowRef={location:{hostname:'saosa.ir'},localStorage:{getItem:()=>JSON.stringify({phone:'09120000000',token:'secret',expiresAt:Date.now()+1000})},fetch:async(...args)=>{calls.push(args);return {ok:true,json:async()=>({id:'invite-1',status:'invited'})};}};
  const adapter=createSmsInvitationAdapter({windowRef});
  const result=await adapter.sendInvitation({projectId:'p1',projectName:'خانه',member:{mobile:'09123456789',email:'u@example.com',role:'viewer',permissions:{}}});
  assert.equal(result.id,'invite-1');
  assert.equal(calls[0][0],'/api/v1/projects/p1/invitations');
  assert.deepEqual(JSON.parse(calls[0][1].body),{phone:'09123456789',email:'u@example.com',role:'viewer',permissions:{},projectName:'خانه'});
});
