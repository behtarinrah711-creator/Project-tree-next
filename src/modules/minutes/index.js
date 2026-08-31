import { createLegacyModule } from '../legacyModule.js';

export default createLegacyModule({ id: 'minutes', title: 'صورت جلسه‌ها', route: 'minutes', open: 'openMinutesPage', render: 'renderMinutesPage', selectors: ['#minutesPage', '#minutesPageBody'], dataCollections: ['minutes'] });
