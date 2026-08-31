import { createLegacyModule } from '../legacyModule.js';

export default createLegacyModule({ id: 'accounting', title: 'حسابداری', route: 'accounting', open: 'renderAccountingWorkspace', selectors: ['#content'], dataCollections: ['tasks', 'contracts', 'statusReports'] });
