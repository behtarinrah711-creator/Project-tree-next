import test from 'node:test';
import {
  assertProjectRepositoryStorageBoundary,
  assertProjectRepositoryUsesLocalStorageAdapter,
  assertProjectRepositoryReadsLegacyKeys,
  assertProjectRepositoryUsesCanonicalRuntimeProjects,
} from './projectRepository.contract.test.js';
import {
  assertProjectItemRepositoryContract,
  assertProjectItemRepositoryBehavior,
  assertProjectItemRepositoryLegacyKeyCompatibility,
} from './projectItemRepository.test.js';
import {
  assertActivityRepositoryContract,
  assertActivityRepositoryBehavior,
  assertActivityRepositoryLegacyKeyCompatibility,
} from './activityRepository.test.js';
import {
  assertContactRepositoryContract,
  assertContactRepositoryBehavior,
  assertContactRepositoryLegacyKeyCompatibility,
} from './contactRepository.test.js';
import {
  assertContractRepositoryContract,
  assertContractRepositoryBehavior,
} from './contractRepository.test.js';

const repositoryChecks = {
  'ProjectRepository storage boundary': assertProjectRepositoryStorageBoundary,
  'ProjectRepository browser adapter': assertProjectRepositoryUsesLocalStorageAdapter,
  'ProjectRepository legacy keys': assertProjectRepositoryReadsLegacyKeys,
  'ProjectRepository canonical runtime projects': assertProjectRepositoryUsesCanonicalRuntimeProjects,
  'ProjectItemRepository contract': assertProjectItemRepositoryContract,
  'ProjectItemRepository behavior': assertProjectItemRepositoryBehavior,
  'ProjectItemRepository legacy keys': assertProjectItemRepositoryLegacyKeyCompatibility,
  'ActivityRepository contract': assertActivityRepositoryContract,
  'ActivityRepository behavior': assertActivityRepositoryBehavior,
  'ActivityRepository legacy keys': assertActivityRepositoryLegacyKeyCompatibility,
  'ContactRepository contract': assertContactRepositoryContract,
  'ContactRepository behavior': assertContactRepositoryBehavior,
  'ContactRepository legacy keys': assertContactRepositoryLegacyKeyCompatibility,
  'ContractRepository contract': assertContractRepositoryContract,
  'ContractRepository behavior': assertContractRepositoryBehavior,
};

for(const [name, check] of Object.entries(repositoryChecks)){
  test(name, () => check());
}
