/** Phase 8.2 — install UI primitives on window.KarhaUI and wire DOM bindings. */
import * as digits from './digits.js';
import { showToast } from './toast.js';
import { openConfirm, closeConfirm, installConfirmBindings } from './confirm.js';
import { showIncompleteFormExitChoice } from './formExitChoice.js';
import { openNumpadGeneric, closeNumpad, installNumpadBindings } from './numpad.js';
import {
  gregorianToJalali, jalaliToGregorian, jalaliMonthLength, todayJalaliStr,
  formatJalaliDisplay, openJalaliPicker, closeJalaliPicker, installJalaliBindings, JALALI_MONTHS
} from './jalali.js';

export function installUiPrimitives({ windowRef = globalThis, documentRef } = {}){
  documentRef = documentRef || windowRef?.document || null;
  const api = Object.freeze({
    showToast: (msg) => showToast(msg, { documentRef }),
    openConfirm: (text, onOk, okLabel) => openConfirm(text, onOk, okLabel, { documentRef }),
    closeConfirm: () => closeConfirm({ documentRef }),
    showIncompleteFormExitChoice: (opts) => showIncompleteFormExitChoice({ ...opts, documentRef }),
    openNumpadGeneric: (initial, onDone, opts) => openNumpadGeneric(initial, onDone, opts, { documentRef, windowRef }),
    closeNumpad: (fromPopState) => closeNumpad(!!fromPopState, { documentRef, windowRef }),
    openJalaliPicker: (current, onPick, opts) => openJalaliPicker(current, onPick, opts, { documentRef, windowRef }),
    closeJalaliPicker: (fromPopState) => closeJalaliPicker(!!fromPopState, { documentRef, windowRef }),
    todayJalaliStr,
    formatJalaliDisplay,
    gregorianToJalali,
    jalaliToGregorian,
    jalaliMonthLength,
    JALALI_MONTHS,
    toPersianDigits: digits.toPersianDigits,
    toEnglishDigits: digits.toEnglishDigits,
    groupWithCommas: digits.groupWithCommas,
    formatCost: digits.formatCost,
    formatCostDisplay: digits.formatCostDisplay,
  });
  windowRef.KarhaUI = api;
  if(documentRef){
    installConfirmBindings({ documentRef });
    installNumpadBindings({ documentRef, windowRef });
    installJalaliBindings({ documentRef, windowRef });
  }
  return api;
}

export default { installUiPrimitives };
