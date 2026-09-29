import {test,expect} from '@jitterbox/repro-playwright';
test('Report preparation never announces failure',async({page,repro})=>{
 const notice=page.locator('#notice');
 await repro.step('prepare',async()=>{await page.goto(process.env.REPRO_URL!);await expect(page.getByRole('heading',{name:'Report download'})).toBeVisible();repro.target('notice',notice);await page.evaluate(()=>{(window as any).__noticeHistory=[];new MutationObserver(()=>{(window as any).__noticeHistory.push({text:document.querySelector('#notice')!.textContent,t:performance.now()})}).observe(document.querySelector('#notice')!,{childList:true,subtree:true,characterData:true});});});
 await repro.step('trigger',async()=>{await repro.segment('operation',async()=>{await page.getByRole('button',{name:'Prepare report'}).click();await expect(notice).toHaveText('Report ready');});});
 await repro.step('verify',async()=>{await expect(notice).toHaveText('Report ready');const history=await page.evaluate(()=>(window as any).__noticeHistory.map((x:any)=>x.text));await repro.outcome('result',()=>expect(history).not.toContain('Download failed'));await repro.checkpoint('result');});
});
