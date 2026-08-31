# فاز ۴ — گزارش نهایی

## برش‌ها

| برش | وضعیت |
|-----|--------|
| ۴.۱ Inventory | ✅ `docs/phase-4-legacy-inventory.md` |
| ۴.۲ Sync/Persist | ✅ `persistAdapter` + `applyCloudSnapshot`؛ Domain بدون `KarhaLegacy.persist`؛ Auth دست‌نخورده |
| ۴.۳ Read cutover | ✅ `projectWorkspace` repository-first؛ drawer ترجیح workspace list |
| ۴.۴ Shell | ✅ drawer از `projectWorkspace.listProjects`؛ router/shell موجود حفظ |
| ۴.۵ Form runtime | ✅ `persistActivities` / `persistContacts` / `persistItems` → `persist({ local:false })` |
| ۴.۶ Quarantine | ✅ `src/modules/condemned/index.js` — فقط مرز، بدون refactor محصولی |
| ۴.۷ Cleanup | ✅ recovery retention از apply list؛ تست‌ها سبز |

## قبل / بعد legacyApp.js

| | بایت |
|--|------|
| قبل از فاز ۴ (تقریبی پس از فاز ۳) | ~۲۸۸۹۴۵ |
| بعد از فاز ۴ | ~۲۹۰۲۴۴ |

حجم کمی **افزایش** یافت (snippetهای applyCloudSnapshot داخل listener).  
**KPI اصلی ownership بود نه حجم** — عمداً برای عدد، کد محکوم جابه‌جا نشد.

## Dependency نهایی (Domain)

- `activityApi` / `contactApi` / `contractApi` / `taskApi` / `projectApi` → `persistAdapter` (نه KarhaLegacy)
- `mergePolicy` روی cloud metadata/collections
- `applyCloudSnapshot` روی KarhaApp؛ listenerها repository را به‌روز می‌کنند

## باقی‌مانده برای فازهای بعد

- Auth lifecycle هنوز در legacy
- استخراج فیزیکی کل cloud listenerها از `legacyApp.js`
- حذف قابلیت‌های محکوم (فاز ۵)
- duplicate `canDeleteProjectRecord` در legacy در کنار `deleteGuard.js`

## تست

۴۳ تست واحد مرتبط سبز (domain + sync + bootstrap + repos + workspace).
