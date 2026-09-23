function required(name){
  const value = String(process.env[name] || '').trim();
  if(!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function loadConfig(){
  const sessionSecret = required('SESSION_SECRET');
  if(sessionSecret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters');
  return Object.freeze({
    port: Number(process.env.PORT || 3000),
    databaseUrl: required('DATABASE_URL'),
    sessionSecret,
    kavenegarApiKey: required('KAVENEGAR_API_KEY'),
    kavenegarTemplate: process.env.KAVENEGAR_TEMPLATE || 'saosalogin',
  });
}
