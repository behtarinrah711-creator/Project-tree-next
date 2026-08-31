# فاز ۴.۱ — Legacy Inventory

منبع: `src/legacy/legacyApp.js` (~۲۸۹KB، ~۲۹۹ function)  
تاریخ: پس از Merge فاز ۱–۳

معیار جارو: ownership درست و قطع dependency — نه KPI حجم اجباری.

---

## گروه‌بندی مالکیت مقصد

| گروه | نمونه‌ها | owner مقصد | برش |
|------|----------|------------|-----|
| **Persist / Dirty** | `markDirty`, `persist`, `dirtyProjectIds`, `loadData` (بخش write) | `src/sync/persistAdapter` | **۴.۲** |
| **Cloud sync / hydrate** | `cloudSyncProjectFull`, `startCloudListeners`, `startCloudTaskListener`, `docToProject`, `mergeCloudSnapshots`, `hydrateProjectTasksFromCloud`, `writeTaskRecordsNormalized`, status queue | `src/sync/cloudAdapter` (منطق؛ Auth جدا) | **۴.۲** |
| **Task recovery cache** | `rememberProjectTasks`, `TASK_RECOVERY_KEY`, `getRecoveredLocalTasks` | کنار cloud/persist | **۴.۲** |
| **Auth lifecycle / UI** | `auth`, `updateAccountUI`, login/logout Google، `currentUser`, `cloudMode` | فعلاً **legacy** | فاز Auth جدا — **نه ۴.۲** |
| **Read live bag** | `data`, `findProject`, `getProjectsList` via KarhaLegacy | Repository-first | **۴.۳** |
| **Shell / nav** | `renderDrawerProjectList`, `renderTabs`, `renderAll`, `setActiveProject`, routes, bottom nav | core/shell modules | **۴.۴** |
| **Form runtime** | `activityFormRuntime`, `contactFormRuntime`, numpad, toast, confirm | `src/ui` + modules | **۴.۵** |
| **Domain already cut over** | CRUD پنج دامنه از API | `src/domain/*` | ✅ فاز ۲ |
| **Delete guards** | `findProjectRecordReferences` (legacy copy) | `deleteGuard.js` sole | جارو ۴.۷ حذف duplicate |
| **محکوم — quarantine** | status test/page، approval، letters/purchases/minutes modules، share fork | مرز فقط | **۴.۶** |
| **Utils** | digits، cost format، jalali، svg icons، elFromHtml | `src/ui/utils` تدریجی | ۴.۵/۴.۷ |
| **PDF / export** | export page | بعداً یا quarantine | ۴.۶/بعد |

---

## Facade فعلی `window.KarhaLegacy`

Exportهای فعال که callers بیرون از legacy استفاده می‌کنند:

| API | مصرف‌کننده | اقدام فاز ۴ |
|-----|------------|-------------|
| `persist` / `markDirty` | domain `publishLive` | → persistAdapter (**۴.۲**) |
| `getProject` / `getProjectsList` | workspace, drawer, recovery, dashboard | repository-first (**۴.۳**) |
| `selectProject` / `setActiveProject` | workspace | shell (**۴.۴**) |
| `renderAll`, icons, formatCost | dashboard, task UI | shell/utils |
| `openContractsPage`, form shells | reports, contracts | بماند تا ۴.۴/۴.۵ |
| `activityFormRuntime` / `contactFormRuntime` | form modules | **۴.۵** |
| `projectItemRuntime.persistItems` | (legacy paths) | cloud-only / adapter **۴.۲** |
| `canDeleteProjectRecord` | UI قدیمی | به deleteGuard |

---

## Dependency پنهان / ریسک انتقال

1. **`data` global** — همهٔ find/render به آن وابسته‌اند؛ ۴.۳ بدون apply قطعی خطرناک است.  
2. **`persist()` کامل** هنوز در runtimeهای form و بعضی مسیرهای محکوم.  
3. **Auth و `cloudMode`/`currentUser`** داخل همان فایل — از ۴.۲ جدا نگه داشته شود.  
4. **Helperهای مشترک** (`showToast`, `openConfirm`, `toEnglishDigits`) — زود به domain نروند؛ با UI utils.  
5. **Duplicate delete guard** در legacy و `deleteGuard.js`.  
6. **محکوم‌ها** به `markDirty`/`persist` وصل‌اند — quarantine نه refactor.

---

## ترتیب قفل‌شده (بدون تغییر)

۴.۱ Inventory ✅ (این سند)  
→ ۴.۲ Sync/Persist extraction (بدون Auth)  
→ ۴.۳ Read cutover  
→ ۴.۴ Shell  
→ ۴.۵ Form runtime  
→ ۴.۶ Quarantine حداقلی  
→ ۴.۷ Cleanup  

---

## معیار موفقیت فاز ۴ (یادآوری)

- Domain به `KarhaLegacy.persist` وابسته نباشد  
- Read path بعد از apply قطعی repository-first  
- محکوم‌ها فقط مرزبندی  
- کاهش حجم KPI فرعی  
