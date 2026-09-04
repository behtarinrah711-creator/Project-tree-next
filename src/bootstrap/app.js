/**
 * Keep this browser entry deliberately detached from the application graph.
 * A dynamic import lets us report failures that happen while that graph is
 * being evaluated, without affecting the independently loaded shell entry.
 */
export async function bootstrapApplication({
  loadStartup = () => import('./applicationStartup.js'),
  windowRef = window,
  consoleRef = console,
} = {}){
  try{
    const { startApplication } = await loadStartup();
    const application = await startApplication();
    if(windowRef?.document){
      try{
        const { installTimelineEnhancements } = await import('../modules/wbs/timelineEnhancements.js');
        installTimelineEnhancements({ windowRef, documentRef: windowRef.document });
      } catch(error){
        consoleRef.error('Karha Timeline enhancements failed', error);
      }
    }
    return application;
  } catch(error){
    consoleRef.error('Karha application startup failed', error);
    windowRef.dispatchEvent(new windowRef.CustomEvent('karha:startup-error', {
      detail: { error },
    }));
    return null;
  }
}

if(typeof window !== 'undefined' && typeof document !== 'undefined'){
  await bootstrapApplication();
}
