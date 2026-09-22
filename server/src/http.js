export const MAX_BODY_BYTES = 5 * 1024 * 1024;

export function sendJson(response, status, body){
  const value = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(value),
    'cache-control': 'no-store',
  });
  response.end(value);
}

export async function readJson(request, limit = MAX_BODY_BYTES){
  let size = 0;
  const chunks = [];
  for await (const chunk of request){
    size += chunk.length;
    if(size > limit){
      const error = new Error('Request body is too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if(!chunks.length) return {};
  try{
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }catch{
    const error = new Error('Request body must be valid JSON');
    error.statusCode = 400;
    throw error;
  }
}

export function route(request){
  return new URL(request.url || '/', 'http://127.0.0.1');
}
