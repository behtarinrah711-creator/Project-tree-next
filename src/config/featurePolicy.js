const FLOATING_CONFIRM_EMAILS=Object.freeze(['azizian.moh3n@gmail.com','behtarinrah711@gmail.com']);
export function normalizeEmail(email){ return String(email||'').trim().toLowerCase(); }
export function isFloatingConfirmUser(user){
  return !!(user?.email&&FLOATING_CONFIRM_EMAILS.includes(normalizeEmail(user.email)));
}
