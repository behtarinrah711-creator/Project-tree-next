import './export/recursiveProjectExport.js';
import dashboard from './dashboard/index.js';
import planning from './planning/index.js';
import execution from './execution/index.js';
import contracts from './contracts/index.js';
import accounting from './accounting/index.js';
import reports from './reports/index.js';
import people from './people/index.js';
import activities from './activities/index.js';
import projectSettings from './projectSettings/index.js';
import roleManagement from './roleManagement/index.js';
import { CONDEMNED_MODULE_IDS, isCondemnedModuleId } from './condemned/index.js';

/**
 * Phase 5: condemned modules are not registered.
 * letters | minutes | purchases | statuses remain on disk only.
 */
export const projectModules = [dashboard, planning, execution, contracts, accounting, reports, people, activities, projectSettings, roleManagement];

export { CONDEMNED_MODULE_IDS, isCondemnedModuleId };
