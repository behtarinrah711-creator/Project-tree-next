import contractsModule from './contractsModule.js';
import contractTemplateFormModule from './contractTemplateFormModule.js';
import realContractFormModule from './realContractFormModule.js';
import * as contractPickers from './contractPickers.js';
import * as paymentStagesModule from './paymentStagesModule.js';
import contractStatusModule from './contractStatusModule.js';
import contractApprovalModule from './contractApprovalModule.js';
import * as contractItemInteractions from './contractItemInteractions.js';
import * as realContractDomain from './realContractDomain.js';
import * as contractTemplatePersistence from './contractTemplatePersistence.js';
import * as contractTemplatesDomain from './contractTemplatesDomain.js';
export * from './contractPersistence.js';

export default contractsModule;
export { contractsModule };

export { contractTemplatesDomain };

if (typeof window !== 'undefined') window.KarhaContractTemplates = contractTemplatesDomain;

export { contractTemplateFormModule };

export { contractTemplatePersistence };

export { realContractDomain };

if (typeof window !== 'undefined') window.KarhaRealContracts = realContractDomain;

export { realContractFormModule };
if (typeof window !== 'undefined') window.KarhaRealContractForm = realContractFormModule;

export { contractPickers };
if (typeof window !== 'undefined') window.KarhaContractPickers = contractPickers;

export { paymentStagesModule };
if (typeof window !== 'undefined') window.KarhaPaymentStages = paymentStagesModule;

export { contractStatusModule };
if (typeof window !== 'undefined') window.KarhaContractStatus = contractStatusModule;

export { contractApprovalModule };
if (typeof window !== 'undefined') window.KarhaContractApproval = contractApprovalModule;

export { contractItemInteractions };
if (typeof window !== 'undefined') window.KarhaContractItemInteractions = contractItemInteractions;
