import './export/recursiveProjectExport.js';
import dashboard from './dashboard/index.js';
import contracts from './contracts/index.js';
import accounting from './accounting/index.js';
import reports from './reports/index.js';
import people from './people/index.js';
import activities from './activities/index.js';
import { CONDEMNED_MODULE_IDS, isCondemnedModuleId } from './condemned/index.js';

/**
 * Phase 5: condemned modules are not registered.
 * letters | minutes | purchases | statuses remain on disk only.
 */
export const projectModules = [dashboard, contracts, accounting, reports, people, activities];

export { CONDEMNED_MODULE_IDS, isCondemnedModuleId };
