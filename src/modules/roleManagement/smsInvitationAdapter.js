/**
 * SMS integration boundary. This adapter deliberately performs no delivery;
 * a real provider can implement the same interface without changing the role module.
 */
export function createSmsInvitationAdapter(){
  return Object.freeze({
    provider:'not-configured',
    configured:false,
    async sendInvitation(){
      return Object.freeze({ sent:false, reason:'provider-not-configured' });
    },
  });
}

export const smsInvitationAdapter=createSmsInvitationAdapter();
