# فاز ۵ — گزارش نهایی

## قفل‌ها
1. contractStatusReports داده wipe نشد؛ فقط inactive
2. visibility: ownerUid === uid برای کاربر لاگین
3. deep link محکوم → dashboard همان پروژه
4. Google Auth adapter باقی ماند

## انجام‌شده
- ۵.۱ inventory
- ۵.۲ modules letters/minutes/purchases/statuses از registry خارج
- ۵.۳ entry قطع
- ۵.۴ deleteGuard بدون block روی status reports؛ open*status → dashboard
- ۵.۵ sharedWith listener خاموش؛ projectsVisibleForAuth owner-only
- ۵.۶ تست‌ها سبز

## داده مردهٔ باقی‌مانده در store (عمدی)
contractStatusReports, sharedWith, letters/minutes fields if any
