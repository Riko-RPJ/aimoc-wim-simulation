import {createParallelScene} from './parallel-scene.js';
// Reuses existing modular deck/truck/camera/navigation; one Phase 1 deck at X=0/Z=0.
export function createSingleStaticScene(host,language,options={}){
  return createParallelScene(host,language,{...options,doubleStatic:false,singleStatic:true});
}
