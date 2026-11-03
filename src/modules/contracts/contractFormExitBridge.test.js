import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./contractFormExitBridge.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/export default .*;/g, '').replace(/export function /g, 'function ');

for (const declaration of [false, true]) {
  test(`exit bridge preserves save intent and manual fields: completion=${declaration}`, () => {
    let persisted, args;
    const messages = [];
    const form = {
      open(){}, requestClose(){}, close(){}, setDirty(){}, saveDraft(){},
      getState: () => ({id:'c'}),
      save(...values){
        args = values;
        persisted = {id:'c', status:values[2]?'final':'draft', isDraft:!values[2], completedAt:values[2]?123:null};
        return true;
      }
    };
    const windowRef = {document:{}, localStorage:{removeItem(){}}, KarhaRealContractForm:form,
      KarhaLegacy:{showToast:message=>messages.push(message)}, setTimeout:fn=>fn()};
    const context = {STORAGE_KEYS:{}, projectContext:{getProjectId:()=> 'p'},
      contractApi:{get:()=>persisted}, createFormExitSession(){}};
    vm.createContext(context);
    vm.runInContext(source, context);
    context.installContractFormExitBridge({windowRef});
    const fields = ['employerId','endDate'];
    assert.equal(form.save('p', false, declaration, fields), true);
    assert.deepEqual(args, ['p',true,declaration,fields]);
    assert.equal(persisted.status, declaration?'final':'draft');

    // A stale draft must never be reported as successful completion.
    persisted = {id:'c',status:'draft',isDraft:true};
    context.contractApi.get = () => ({id:'c',status:'draft',isDraft:true});
    if(declaration){
      assert.equal(form.save('p',false,true,fields), false);
      assert.equal(messages.at(-1), 'ذخیره قرارداد تایید نشد');
    }
  });
}
