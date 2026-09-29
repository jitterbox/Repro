import {test,expect} from '@jitterbox/repro-playwright';
test('Latest inventory search survives older completion',async({page,repro})=>{
 const query=page.getByRole('textbox',{name:'Search inventory'}); const result=page.getByLabel('Search result'); let responses:any[]=[];
 await repro.step('prepare',async()=>{await page.goto(process.env.REPRO_URL!);await expect(page.getByRole('heading',{name:'Inventory search'})).toBeVisible();repro.target('query',query);repro.target('result',result);});
 await repro.step('trigger',async()=>{await repro.segment('operation',async()=>{const oak=page.waitForResponse(r=>r.url().includes('/api/search')&&r.url().includes('oak'));const pine=page.waitForResponse(r=>r.url().includes('/api/search')&&r.url().includes('pine'));await query.fill('oak');await page.getByRole('button',{name:'Search',exact:true}).click();await query.fill('pine');await page.getByRole('button',{name:'Search',exact:true}).click();responses=await Promise.all([oak,pine]);await Promise.all(responses.map(r=>r.finished()));await page.waitForTimeout(100);});});
 await repro.step('verify',async()=>{for(const r of responses){await repro.network('result',r);expect(r.status()).toBe(200);}await expect(query).toHaveValue('pine');await repro.outcome('result',()=>expect(result).toHaveText('Pine desk',{timeout:300}));await repro.checkpoint('result');});
});
