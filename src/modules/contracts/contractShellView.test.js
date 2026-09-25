import test from 'node:test';
import assert from 'node:assert/strict';
import { installContractShellView } from './contractShellView.js';

test('contract templates header back consumes its child history entry',()=>{
  const closeButton={onclick:null};
  const consumed=[];
  const windowRef={
    KarhaChildHistory:{consume:key=>{consumed.push(key);return true;}},
    document:{getElementById:id=>id==='closeContractTemplatesPage'?closeButton:null},
  };

  installContractShellView({windowRef,documentRef:windowRef.document});
  closeButton.onclick();

  assert.deepEqual(consumed,['contractTemplates']);
});

test('contract templates header back falls back to settings without child history',()=>{
  const closeButton={onclick:null};
  const calls=[];
  const windowRef={
    setBottomNavActive:key=>calls.push(['footer',key]),
    renderTabs:()=>calls.push(['tabs']),
    showOnlyWorkspacePage:page=>calls.push(['page',page]),
    updateWorkspaceContextBar:()=>calls.push(['context']),
    renderSettingsWorkspace:()=>calls.push(['settings']),
    document:{getElementById:id=>id==='closeContractTemplatesPage'?closeButton:null},
  };

  installContractShellView({windowRef,documentRef:windowRef.document});
  closeButton.onclick();

  assert.ok(calls.some(call=>call[0]==='page'&&call[1]==='settingsPage'));
  assert.ok(calls.some(call=>call[0]==='settings'));
});
