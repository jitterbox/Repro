export function maskTrackerScript(selectors: readonly string[]): string {
  return `(() => {
 const selectors=${JSON.stringify(selectors)};
 if (!selectors.length) return;
 const previous=new Map();
 const failed=new Set();
 const reject=(selector,message)=>{
  if(failed.has(selector))return;
  failed.add(selector);
  void window.__reproEmit?.({protocol:1,type:'redaction.error',time:performance.now(),timeOrigin:performance.timeOrigin,documentId:window.__REPRO_DOCUMENT_ID__,selector,message});
 };
 const sample=()=>{
  for(const selector of selectors) {
   if(failed.has(selector))continue;
   let elements;
   try { elements=[...document.querySelectorAll(selector)]; } catch { reject(selector,'Invalid redaction selector'); continue; }
   if(elements.length && window!==window.top){reject(selector,'Redaction in a child frame requires a verified viewport transform');continue;}
   const boxes=elements.flatMap(element=>[...element.getClientRects()].map(r=>({x:r.x,y:r.y,width:r.width,height:r.height})));
   const value=JSON.stringify(boxes);
   if(previous.get(selector)!==value) {
    previous.set(selector,value);
    for(const box of boxes) void window.__reproEmit?.({protocol:1,type:'redaction.mask',time:performance.now(),timeOrigin:performance.timeOrigin,documentId:window.__REPRO_DOCUMENT_ID__,selector,...box});
   }
  }
  requestAnimationFrame(sample);
 };
 requestAnimationFrame(sample);
})();`;
}
