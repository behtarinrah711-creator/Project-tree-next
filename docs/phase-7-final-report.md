# فاز ۷ — گزارش نهایی

## انجام‌شده
| برش | نتیجه |
|-----|--------|
| ۷.۱ | inventory |
| ۷.۲ | docToProject + mergeOwnedCloudSnapshots در src/sync |
| ۷.۳ | taskCloud: writeTaskRecordsNormalized, attachCloudTaskListener, mergeTaskSnapshot |
| ۷.۴ | cloudSyncProjectFull + buildProjectCloudPayload در src/sync |
| ۷.۵ | exportهای KarhaLegacy بدون caller صفر حذف نشدند (grep) |
| ۷.۶ | shell قبلاً در فاز ۶؛ بدون دست زدن به contract form |
| ۷.۷ | تست + ZIP |

## عمداً مانده در legacy
- hydrateProjectTasksFromCloud / recoverLegacyTasksForProject (بدنه؛ listener/write استخراج شد)
- Auth UI
- status queue metadata
- shell render بزرگ

## قفل‌ها
- mergePolicy / anti-empty بدون تغییر رفتاری
- Auth جابه‌جا نشد
- فرم قرارداد دست‌نخورده

## legacyApp
- شروع فاز ۷: ~279475
- پایان: ببین wc
