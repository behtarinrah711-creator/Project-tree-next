let observer = null;
let frame = 0;
let resizeHandler = null;
let fontsReadyHandler = null;

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
  if(!sticky || !timeScroll || !bodyScroll || !timelineScroll) return;

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

function settleLayout(gantt, windowRef, { initialize = false } = {}){
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if(!gantt.isConnected || !geometryReady(gantt)) return;
      syncLayout(gantt, windowRef, { initialize });
    });
  });
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
  // The timescale enhancer owns the final canvas width and row geometry. Moving
  // the header before that pass completes can freeze the first render in the
  // provisional layout until a later timescale/expand action forces reflow.
  if(!geometryReady(gantt)) return;

  if(gantt.classList.contains('has-sticky-header-layout')){
    bindScrollSync(gantt, windowRef);
    const geometryChanged = gantt.dataset.stickyHeaderSignature !== geometrySignature(gantt);
    settleLayout(gantt, windowRef, { initialize:geometryChanged });
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
  // DOM ownership changed in this frame. Wait for two paint opportunities so
  // grid tracks, SVG intrinsic widths and the horizontal scroll range all use
  // the final geometry before choosing the initial viewport.
  settleLayout(gantt, windowRef, { initialize:true });
}

function enhanceAll(windowRef, documentRef){
  documentRef.querySelectorAll('.wbs-home-root.is-timeline-view .wbs-gantt').forEach(gantt => {
    mountStickyHeader(gantt, windowRef, documentRef);
  });
}

function schedule(windowRef, documentRef){
  if(frame) cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    frame = 0;
    enhanceAll(windowRef, documentRef);
  });
}

export function installTimelineStickyHeader({ windowRef = window, documentRef = document } = {}){
  observer?.disconnect();
  if(resizeHandler) windowRef.removeEventListener('resize', resizeHandler);

  const root = documentRef.getElementById('content') || documentRef.body;
  observer = new MutationObserver(() => schedule(windowRef, documentRef));
  observer.observe(root, { childList:true, subtree:true });

  resizeHandler = () => schedule(windowRef, documentRef);
  windowRef.addEventListener('resize', resizeHandler, { passive:true });

  const fontsReady = documentRef.fonts?.ready;
  if(fontsReady?.then){
    fontsReadyHandler = () => schedule(windowRef, documentRef);
    fontsReady.then(fontsReadyHandler).catch(() => {});
  }

  schedule(windowRef, documentRef);

  return () => {
    observer?.disconnect();
    if(frame) cancelAnimationFrame(frame);
    frame = 0;
    windowRef.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
    fontsReadyHandler = null;
  };
}

export default { installTimelineStickyHeader };
