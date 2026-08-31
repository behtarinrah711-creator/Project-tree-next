# گزارش مرحله A: ناپدید شدن taskها

## نتیجه و حد توقف

این repository هیچ fixture یا dump واقعی از پروژه‌ای با نام راهنمای «تستی» ندارد. تنها رخدادهای این واژه، متن UI مربوط به «صورت وضعیت تستی» هستند و رکورد پروژه نیستند. بنابراین `projectId`، ID آیتم‌ها، وضعیت `trashed` و reference قراردادهای آن محیط از روی repository قابل اثبات نیست. علت ریشه‌ای **قطعی نیست** و این تغییر فقط diagnostic است؛ هیچ restore، mutate داده یا تغییر production انجام نشده است.

## مالک و مسیر فعلی داده

- قالب ذخیره‌سازی محلی همچنان `gtasks-clone-v2` است و `Project.tasks` را repository با scope پروژه می‌خواند.
- در cloud mode، taskهای canonical در subcollection مستقل `projects/{projectId}/tasks` hydrate می‌شوند. listener آن‌ها را با object زنده پروژه merge می‌کند و dashboard ابتدا همان object زنده را render می‌کند؛ local repository ممکن است snapshot قبلی باشد.
- فیلتر نمایش dashboard، taskهای `trashed` یا pending-delete را حذف می‌کند و `done` را در بخش تکمیل‌شده نشان می‌دهد.

این تحلیل architecture است، نه شاهد وضعیت رکورد واقعی «تستی». بدون dump همان runtime نمی‌توان میان soft-delete، filter، hydration race، reference به subtask یا نبود واقعی رکورد داوری قطعی کرد.

## diagnostic فقط‌خواندنی

از DevTools همان دستگاه، مقدار JSON کلید `gtasks-clone-v2` را بدون ویرایش export کنید (یا export معادلِ snapshot زنده‌ای که پس از hydration گرفته شده است). سپس، فقط با `projectId` واقعی اجرا کنید:

```sh
node scripts/diagnose-task-visibility.mjs /path/to/snapshot.json '<projectId>'
```

ابزار فقط JSON را می‌خواند و گزارش می‌دهد:

- `len(tasks)` در `counts.tasks` و count همه رکوردهای task/subtask در `records`؛
- countهای `trashed`، `done` و `visible = !trashed && !pendingDelete`؛
- تطبیق دقیق `contract.projectItemId` با `task.id` یا `subtask.id`؛
- تطبیق فیلدهای ID مخاطب قرارداد با `contact.id`؛
- کاندیدهای صرفاً تشخیصی `referencedTrashed` همراه `contractId`، ID، parent/root ID و metadata حذف.

نام پروژه و عنوان task هرگز برای lookup یا recovery استفاده نمی‌شود. ابزار هیچ storage/API را نمی‌نویسد و restore انجام نمی‌دهد.

## ارزیابی فرضیه‌ها با شواهد فعلی

| فرضیه | وضعیت فعلی |
|---|---|
| task مشخص موجود و `trashed:true` | اثبات‌نشده؛ داده runtime موجود نیست |
| task سالم ولی owner/render پنهان می‌کند | اثبات‌نشده |
| race بین canonical و snapshot خوانده‌شده | در architecture ممکن است، اما برای این رکورد اثبات‌نشده |
| فیلتر `pendingDelete` / active project / guest | اثبات‌نشده |
| reference قرارداد به subtask و مشکل visibility والد | اثبات‌نشده |
| حذف قطعی یا persist نشدن | اثبات‌نشده |

مرحله B تنها پس از مشاهده `referencedTrashed` در dump واقعی همان محیط و بررسی business rule برای همان IDها قابل بررسی است. حتی خروجی diagnostic به‌تنهایی mutate نمی‌کند و نباید با نام/عنوان تکمیل یا به task دیگری متصل شود.
