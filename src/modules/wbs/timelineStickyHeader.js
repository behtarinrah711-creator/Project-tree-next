let observer = null;
let resizeHandler = null;

function isMobile(windowRef){
  return Boolean(windowRef?.matchMedia?.('(max-width: 719px)').matches);
}

function rightmostScroll(element){
  return Math.max(0, element.scrollWidth - element.clientWidth);
}

function geometrySignature(gantt){
  return gantt.dataset.timescaleSignature || '';
}

function geometryReady(gantt){
  return Boolean(
    gantt.classList.contains('is-scale-enhanced') &&
    geometrySignature(gantt) &&
    gantt.querySelector('.wbs-gantt-scale-header-canvas')
  );
}

function syncLayout(gantt, windowRef, { initialize = false } = {}){
  const sticky = gantt.querySelector(':scope > .wbs-gantt-sticky-header');
  const timeScroll = sticky?.querySelector('.wbs-gantt-sticky-time-scroll');
  const bodyScroll = gantt.querySelector(':scope > .wbs-gantt-body-scroll');
  const timelineScroll = bodyScroll?.querySelector('.wbs-gantt-scroll');
  if(!sticky || !timeScroll || !bodyScroll || !timelineScroll || !geometryReady(gantt)) return;

  const mobile = isMobile(windowRef);
  const mode = mobile ? 'mobile' : 'desktop';
  const modeChanged = gantt.dataset.stickyHeaderMode !== mode;
  const signature = geometrySignature(gantt);
  const geometryChanged = gantt.dataset.stickyHeaderSignature !== signature;

  gantt.dataset.stickyHeaderMode = mode;
  gantt.dataset.stickyHeaderSignature = signature;

  if(mobile){
    if(initialize || modeChanged || geometryChanged){
      bodyScroll.scrollLeft = rightmostScroll(bodyScroll);
    }
    sticky.scrollLeft = bodyScroll.scrollLeft;
  }else{
    sticky.scrollLeft = 0;
    if(initialize || modeChanged || geometryChanged){
      timelineScroll.scrollLeft = rightmostScroll(timelineScroll);
    }
    timeScroll.scrollLeft = timelineScroll.scrollLeft;
  }
}

function bindScrollSync(gantt, windowRef){
  if(gantt.dataset.stickyHeaderBound === 'true') return;

  const sticky = gantt.querySelector(':scope > .wbs-gantt-sticky-header');
  const timeScroll = sticky?.querySelector('.wbs-gantt-sticky-time-scroll');
  const bodyScroll = gantt.querySelector(':scope > .wbs-gantt-body-scroll');
  const timelineScroll = bodyScroll?.querySelector('.wbs-gantt-scroll');
  if(!sticky || !timeScroll || !bodyScroll || !timelineScroll) return;

  bodyScroll.addEventListener('scroll', () => {
    if(isMobile(windowRef)) sticky.scrollLeft = bodyScroll.scrollLeft;
  }, { passive:true });

  timelineScroll.addEventListener('scroll', () => {
    if(!isMobile(windowRef)) timeScroll.scrollLeft = timelineScroll.scrollLeft;
  }, { passive:true });

  gantt.dataset.stickyHeaderBound = 'true';
}

function mountStickyHeader(gantt, windowRef, documentRef){
  // data-timescale-signature is committed by the Timeline enhancer only after
  // the current render has its final header canvas and row geometry. Treat that
  // signature as the lifecycle boundary for initial render, timescale changes,
  // and expand/collapse re-renders.
  if(!geometryReady(gantt)) return;

  if(gantt.classList.contains('has-sticky-header-layout')){
    bindScrollSync(gantt, windowRef);
    syncLayout(gantt, windowRef);
    return;
  }

  const names = gantt.querySelector(':scope > .wbs-gantt-names');
  const timelineScroll = gantt.querySelector(':scope > .wbs-gantt-scroll');
  const corner = names?.querySelector(':scope > .wbs-gantt-corner');
  const timeline = timelineScroll?.querySelector(':scope > .wbs-gantt-timeline');
  const header = timeline?.querySelector(':scope > .wbs-gantt-header');
  if(!names || !timelineScroll || !corner || !timeline || !header) return;

  const sticky = documentRef.createElement('div');
  sticky.className = 'wbs-gantt-sticky-header';
  sticky.setAttribute('aria-label', 'سربرگ ثابت نمودار زمان‌بندی');

  const stickyTrack = documentRef.createElement('div');
  stickyTrack.className = 'wbs-gantt-sticky-track';

  const timeScroll = documentRef.createElement('div');
  timeScroll.className = 'wbs-gantt-sticky-time-scroll';

  const bodyScroll = documentRef.createElement('div');
  bodyScroll.className = 'wbs-gantt-body-scroll';

  const bodyTrack = documentRef.createElement('div');
  bodyTrack.className = 'wbs-gantt-body-track';

  timeScroll.appendChild(header);
  stickyTrack.append(corner, timeScroll);
  sticky.appendChild(stickyTrack);

  bodyTrack.append(names, timelineScroll);
  bodyScroll.appendChild(bodyTrack);

  gantt.append(sticky, bodyScroll);
  gantt.classList.add('has-sticky-header-layout');

  bindScrollSync(gantt, windowRef);
  // Reading scrollWidth in syncLayout forces layout after ownership changes, so
  // the initial viewport is derived from this exact committed geometry rather
  // than from a later user-triggered render.
  syncLayout(gantt, windowRef, { initialize:true });
}

function enhanceAll(windowRef, documentRef){
  documentRef.querySelectorAll('.wbs-home-root.is-timeline-view .wbs-gantt').forEach(gantt => {
    mountStickyHeader(gantt, windowRef, documentRef);
  });
}

export function installTimelineStickyHeader({ windowRef = window, documentRef = document } = {}){
  observer?.disconnect();
  if(resizeHandler) windowRef.removeEventListener('resize', resizeHandler);

  const root = documentRef.getElementById('content') || documentRef.body;

  // Do not react to provisional child-list mutations. The Timeline enhancer
  // commits data-timescale-signature at the end of every completed geometry
  // pass, including the first render and every expand/collapse render.
  observer = new MutationObserver(mutations => {
    const gantts = new Set();
    mutations.forEach(mutation => {
      if(mutation.type !== 'attributes') return;
      const gantt = mutation.target;
      if(gantt?.matches?.('.wbs-home-root.is-timeline-view .wbs-gantt')) gantts.add(gantt);
    });
    gantts.forEach(gantt => mountStickyHeader(gantt, windowRef, documentRef));
  });
  observer.observe(root, {
    attributes:true,
    subtree:true,
    attributeFilter:['data-timescale-signature'],
  });

  resizeHandler = () => enhanceAll(windowRef, documentRef);
  windowRef.addEventListener('resize', resizeHandler, { passive:true });

  // Covers the case where the enhancer completed before this module installed.
  enhanceAll(windowRef, documentRef);

  return () => {
    observer?.disconnect();
    windowRef.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
  };
}

export default { installTimelineStickyHeader };
