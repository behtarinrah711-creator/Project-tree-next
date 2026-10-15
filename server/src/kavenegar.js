function providerErrorDetails(response, payload){
  const providerReturn = payload && typeof payload === 'object' ? payload.return : null;
  return {
    httpStatus:response.status,
    providerStatus:Number.isFinite(Number(providerReturn?.status)) ? Number(providerReturn.status) : null,
    providerMessage:typeof providerReturn?.message === 'string'
      ? providerReturn.message.slice(0, 240)
      : null,
  };
}

async function readProviderPayload(response){
  try{
    return JSON.parse(await response.text());
  }catch{
    return null;
  }
}

export function createKavenegarLookup({apiKey, fetchImpl=fetch, logger=console}){
  return async function kavenegarLookup(phone, token, template){
    const endpoint = new URL(`https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/verify/lookup.json`);
    endpoint.searchParams.set('receptor', phone);
    endpoint.searchParams.set('token', token);
    endpoint.searchParams.set('template', template);
    const response = await fetchImpl(endpoint);
    if(!response.ok){
      const payload = await readProviderPayload(response);
      logger.error?.('Kavenegar request failed', providerErrorDetails(response, payload));
      const error = new Error('sms_provider_error');
      error.statusCode = 502;
      throw error;
    }
  };
}
