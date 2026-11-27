import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTimelineStickyHeader, captureGanttScroll, restoreGanttScroll } from './timelineStickyHeader.js';

function ganttAt(start,width,scrollLeft){
  const viewport=()=>({scrollWidth:width,clientWidth:300,scrollLeft,addEventListener(){}});
  const timeline=viewport();
  const mobile=viewport();
  const headerTime=viewport();
  const cells={
    ':scope > .wbs-gantt-sticky-header':{scrollLeft:0,querySelector:()=>headerTime},
    ':scope > .wbs-gantt-body-scroll':mobile,
    '.wbs-gantt-body-scroll':mobile,
    '.wbs-gantt-scroll':timeline,
    '.wbs-gantt-scale-header-canvas':{getAttribute:()=>width},
  };
  mobile.querySelector=()=>timeline;
  return {
    dataset:{timescaleSignature:`week:${start}:${start+width/10}`},
    classList:{contains:()=>true}, querySelector:selector=>cells[selector],
    timeline,mobile,headerTime,sticky:cells[':scope > .wbs-gantt-sticky-header'],
  };
}

for(const mobile of [true,false]){
  test(`Gantt keeps its calendar day and vertical position after ${mobile?'mobile':'desktop'} re-render`,()=>{
    const windowRef={matchMedia:()=>({matches:mobile})};
    const container={scrollTop:420};
    const before=ganttAt(100,1000,500);
    const scroll=captureGanttScroll(before,container,windowRef);
    assert.equal(scroll.day,120);
    container.scrollTop=0;

    const after=ganttAt(90,1300,0);
    restoreGanttScroll(after,scroll);
    applyTimelineStickyHeader(after,windowRef,{});
    assert.equal((mobile?after.mobile:after.timeline).scrollLeft,700);
    assert.equal((mobile?after.sticky:after.headerTime).scrollLeft,700);
    assert.equal(container.scrollTop,420);

    (mobile?after.mobile:after.timeline).scrollLeft=600;
    applyTimelineStickyHeader(after,windowRef,{});
    assert.equal((mobile?after.sticky:after.headerTime).scrollLeft,600);
  });
}
