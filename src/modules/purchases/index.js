import { createLegacyModule } from '../legacyModule.js';

export default createLegacyModule({ id: 'purchases', title: 'خریدها', route: 'purchases', open: 'openPurchasesPage', render: 'renderPurchasesPage', selectors: ['#purchasesPage', '#purchasesPageBody'], dataCollections: ['purchases'] });
