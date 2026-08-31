import { bindShellControls } from './shellControls.js';

/** Bind Menu/Login independently of application startup and its import graph. */
export function startShell(options){
  return bindShellControls(options);
}

if(typeof window !== 'undefined' && typeof document !== 'undefined'){
  startShell();
}
