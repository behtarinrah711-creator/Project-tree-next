import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileDrawerProjectList, resolveDrawerProjectState } from './drawerProjectList.js';

function element(){
  return {
    children: [], dataset: {}, className: '', textContent: '',
    appendChild(child){ this.children.push(child); return child; },
    replaceChildren(...children){ this.children=children; },
    addEventListener(type, listener){ this[`on${type}`]=listener; },
    click(){ this.onclick?.({ currentTarget:this }); },
  };
}

test('project selection remains deterministic across reconciliation and refresh', () => {
  const projects=['project-A','project-B','project-C'].map(id=>({id,name:id,tasks:[{id:`task-${id}`}]}));
  const list=element();
  const storage=new Map();
  const context={projectId:null};
  const trace=[];
  const state={activeTab:'project-A',route:'',drawerOpen:true};

  const selectProject = clickedId => {
    trace.push(['clicked',clickedId]);
    const project=projects.find(candidate=>candidate.id===clickedId);
    state.activeTab=project.id;
    context.projectId=project.id;
    state.route=`#/projects/${encodeURIComponent(project.id)}/dashboard`;
    storage.set('activeProjectId',project.id);
    state.drawerOpen=false;
    trace.push(['workspace',project.id]);
    trace.push(['tasks',project.id,project.tasks[0].id]);
    render();
  };
  const render = () => reconcileDrawerProjectList(list, projects, {
    activeProjectId:state.activeTab,
    createRow:element,
    updateRow(row, project, active){ row.className=active?'active':''; row.textContent=project.name; },
    onSelect:selectProject,
  });
  const assertSelection = id => {
    assert.deepEqual(trace.at(-3),['clicked',id]);
    assert.equal(state.activeTab,id);
    assert.equal(context.projectId,id);
    assert.equal(state.route,`#/projects/${id}/dashboard`);
    assert.equal(storage.get('activeProjectId'),id);
    assert.equal(state.drawerOpen,false);
    assert.equal(list.children.find(row=>row.className==='active')?.dataset.projectId,id);
    assert.deepEqual(trace.at(-2),['workspace',id]);
    assert.deepEqual(trace.at(-1),['tasks',id,`task-${id}`]);
  };

  render();
  list.children[1].click();
  assertSelection('project-B');
  state.drawerOpen=true;
  list.children[2].click();
  assertSelection('project-C');

  const rowsBeforeReconcile=new Map(list.children.map(row=>[row.dataset.projectId,row]));
  render();
  assert.equal(list.children[0],rowsBeforeReconcile.get('project-A'));
  assert.equal(list.children[1],rowsBeforeReconcile.get('project-B'));
  assert.equal(list.children[2],rowsBeforeReconcile.get('project-C'));
  state.drawerOpen=true;
  list.children[1].click();
  assertSelection('project-B');

  const refreshed={activeTab:storage.get('activeProjectId')};
  assert.equal(refreshed.activeTab,'project-B');
});

test('drawer keeps selected project highlighted on Projects footer home', () => {
  const projects=[{id:'project-A'},{id:'project-B'}];
  const windowRef={
    KarhaApp:{
      projectContext:{getProjectId:()=> 'project-B'},
      projectWorkspace:{listProjects:()=>projects},
    },
  };
  const state=resolveDrawerProjectState([], {activeProjectId:'starred',windowRef});
  assert.deepEqual(state.projects,projects);
  assert.equal(state.activeProjectId,'project-B');
});

test('drawer resolves projects only through the canonical workspace list', () => {
  const projects=[{id:'project-A'},{id:'project-B'}];
  const windowRef={
    KarhaApp:{
      projectContext:{getProjectId:()=> 'project-A'},
      projectWorkspace:{listProjects:()=>projects},
    },
    KarhaLegacy:{getProjectsList:()=>[{id:'contradictory'}]},
  };
  const state=resolveDrawerProjectState([], {activeProjectId:null,windowRef});
  assert.deepEqual(state.projects,projects);
  assert.equal(state.activeProjectId,'project-A');
});
