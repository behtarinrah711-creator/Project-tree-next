# فاز ۶ — گزارش نهایی (تکمیل بدهی ۶.۴–۶.۶)

## قفل‌ها
1. Cloud: owned-only؛ بدون تغییر mergePolicy/anti-empty؛ Auth جابه‌جا نشد
2. Shell: بدون دست‌زدن به history/form قرارداد
3. KarhaLegacy export: فقط با caller واقعی

## ۶.۴ Cloud/Sync ownership
- `src/sync/cloudListeners.js` — `startOwnedCloudListeners` / `stopOwnedCloudListeners`
- legacy `startCloudListeners` به KarhaApp.startOwnedCloudListeners تفویض می‌کند
- sharedWith همچنان disabled

## ۶.۵ Shell/UI
- `src/ui/toast.js`
- `src/ui/shellSurface.js` (hide/show workspace pages)
- `projectRouteSurface` بدون صفحات محکوم
- فرم قرارداد دست‌نخورده

## ۶.۶ Form runtimes
- `src/ui/formRuntimes.js` — owner ثبت runtime
- `activityFormModule` / `contactFormModule` اول از `KarhaApp.get*FormRuntime`
- KarhaLegacy thin: همان object ثبت‌شده

## تست
55 مرتبط سبز

## legacyApp قبل/بعد این تکمیل
- قبل از فاز ۶: ~291144
- بعد از تکمیل بدهی‌ها: ببین wc

## باقی عمدی
- بدنهٔ hydrate/mergeCloudSnapshots هنوز در legacy (رفتار ثابت؛ listener ownership منتقل شد)
- Auth UI در legacy
