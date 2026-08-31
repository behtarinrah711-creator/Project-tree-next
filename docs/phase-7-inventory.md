# فاز ۷.۱ — Inventory cloud در legacy

| تابع | deps | مقصد |
|------|------|------|
| docToProject | normalizeTaskRecord, getRecoveredLocalTasks, dirty/pending, mergePolicy | src/sync/docToProject.js |
| mergeCloudSnapshots | data, dirty, pending, docToProject; fork share مرده | src/sync/mergeCloudSnapshots.js (بدون fork) |
| start/stopCloudTaskListener | db, cloudMode, merge tasks | src/sync/taskCloud.js |
| hydrateProjectTasksFromCloud | taskCollection, recovery | src/sync/taskCloud.js |
| writeTaskRecordsNormalized | taskCollection | src/sync/taskCloud.js |
| cloudSyncProjectFull | db, shouldUpload, tasks | src/sync/cloudSyncProject.js |
| Auth / updateAccountUI | firebase auth | KEEP legacy |
