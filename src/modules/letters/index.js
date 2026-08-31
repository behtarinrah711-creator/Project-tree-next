import { createLegacyModule } from '../legacyModule.js';

export default createLegacyModule({ id: 'letters', title: 'نامه‌ها', route: 'letters', open: 'openLettersPage', render: 'renderLettersPage', selectors: ['#lettersPage', '#lettersPageBody'], dataCollections: ['letters', 'letterCounters'] });
