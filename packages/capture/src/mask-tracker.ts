export function maskTrackerScript(selectors: readonly string[]): string {
  return `(() => {
 const selectors=${JSON.stringify(selectors)};
 if (!selectors.length) return;
 const previous=new Map();
 const failed=new Set();
 const concealedFor=(element)=>{
  if (element && element.type==='password') return true;
  if (typeof getComputedStyle!=='function') return false;
  try {
   const security=getComputedStyle(element).webkitTextSecurity||'';
   return security!=='' && security!=='none';
  } catch { return false; }
 };
 const reject=(selector,message)=>{
  if(failed.has(selector))return;
  failed.add(selector);
  void window.__reproEmit?.({protocol:1,type:'redaction.error',time:performance.now(),timeOrigin:performance.timeOrigin,documentId:window.__REPRO_DOCUMENT_ID__,selector,message});
 };
 const emit=(selector,now,fields)=>{
  void window.__reproEmit?.({protocol:1,type:'redaction.mask',time:now,timeOrigin:performance.timeOrigin,documentId:window.__REPRO_DOCUMENT_ID__,selector,...fields});
 };
 const sample=()=>{
  for(const selector of selectors) {
   if(failed.has(selector))continue;
   let elements;
   try { elements=[...document.querySelectorAll(selector)]; } catch { reject(selector,'Invalid redaction selector'); continue; }
   if(elements.length && window!==window.top){reject(selector,'Redaction in a child frame requires a verified viewport transform');continue;}
   const now=performance.now();
   const boxes=elements.flatMap(element=>[...element.getClientRects()].map(rect=>{
    const box={x:rect.x,y:rect.y,width:rect.width,height:rect.height};
    return concealedFor(element)?{...box,concealed:true}:box;
   }));
   const value=JSON.stringify(boxes);
   const had=previous.get(selector);
   if(had===value) continue;
   previous.set(selector,value);
   if(!boxes.length){
    // A control that was never observed is not a mask observation.
    if(had!==undefined && had!=='[]') emit(selector,now,{cleared:true});
    continue;
   }
   for(const box of boxes) emit(selector,now,box);
  }
  requestAnimationFrame(sample);
 };
 requestAnimationFrame(sample);
})();`;
}
