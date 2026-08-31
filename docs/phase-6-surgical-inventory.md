# فاز ۶.۱ — Inventory جراحی

## DELETE (محکوم — کامل)

| مورد | محل |
|------|------|
| Share UI | shareFormPage, openShareForm, submitShareForm, collabPage, renderCollabPage, removeShare |
| Status UI | contractStatusPage, contractApprovalPage, statusTestPage, statuses module |
| Letters/Minutes/Purchases | modules + HTML pages + open* |
| shared listener / fork collab | legacy cloud merge branches for collaborator |

## EXTRACT (ماندگار — ownership، بدون تغییر رفتار)

| مورد | مقصد |
|------|------|
| persist/markDirty | src/sync/persistAdapter (موجود) |
| applyCloudSnapshot | src/sync (موجود) |
| cloud owned listener body | src/sync/cloudOwned.js (wrap، رفتار ثابت) |

## KEEP در legacy (موقت)

Auth UI، bootstrap، contract form history، thin KarhaLegacy facade
