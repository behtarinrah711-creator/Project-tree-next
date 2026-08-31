# فاز ۵.۱ — Inventory قابلیت‌های محکوم

## حذف active path (داده wipe نمی‌شود)

| قابلیت | Module/route | Legacy entry | داده |
|--------|--------------|--------------|------|
| نامه‌ها | letters | openLettersPage | letters, letterCounters |
| صورت‌جلسه | minutes | openMinutesPage | minutes |
| خریدها | purchases | openPurchasesPage | purchases subcollection |
| صورت‌وضعیت | statuses + contractStatus* | openContractStatusPage, approval, status test | contractStatusReports, statuses |
| اشتراک | — | sharedWith listener, fork | sharedWith field |

## قفل محصول فاز ۵
- دادهٔ قدیمی contractStatusReports / sharedWith wipe نشود
- visibility ابر: فقط ownerUid === uid
- deep link محکوم → dashboard همان پروژه
- Google Auth adapter باقی بماند
