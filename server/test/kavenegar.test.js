import assert from 'node:assert/strict';
import test from 'node:test';
import {createKavenegarLookup} from '../src/kavenegar.js';

test('logs safe Kavenegar error details without credentials or OTP data', async () => {
  const calls = [];
  const lookup = createKavenegarLookup({
    apiKey:'secret-api-key',
    fetchImpl:async () => new Response(JSON.stringify({
      return:{status:418,message:'اعتبار حساب کافی نیست'},
      entries:null,
    }), {status:418}),
    logger:{error:(message, details) => calls.push({message, details})},
  });

  await assert.rejects(
    lookup('09012549698', '123456', 'saosalogin'),
    error => error.message === 'sms_provider_error' && error.statusCode === 502,
  );

  assert.deepEqual(calls, [{
    message:'Kavenegar request failed',
    details:{
      httpStatus:418,
      providerStatus:418,
      providerMessage:'اعتبار حساب کافی نیست',
    },
  }]);
  const logged = JSON.stringify(calls);
  assert.equal(logged.includes('secret-api-key'), false);
  assert.equal(logged.includes('09012549698'), false);
  assert.equal(logged.includes('123456'), false);
});

test('handles a non-JSON provider error response safely', async () => {
  const calls = [];
  const lookup = createKavenegarLookup({
    apiKey:'secret-api-key',
    fetchImpl:async () => new Response('upstream failure', {status:503}),
    logger:{error:(message, details) => calls.push({message, details})},
  });

  await assert.rejects(lookup('09012549698', '123456', 'saosalogin'));
  assert.deepEqual(calls[0].details, {
    httpStatus:503,
    providerStatus:null,
    providerMessage:null,
  });
});
