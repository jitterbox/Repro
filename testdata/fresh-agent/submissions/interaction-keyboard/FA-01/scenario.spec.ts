import { test, expect } from '@repro/playwright';
test('FA-01 A normal pointer click approves the shipment.', async ({page,repro})=>{
 const target=page.getByRole('button',{name:'Approve shipment',exact:true}); const reference=page.getByRole('status');
 await repro.step('prepare',async()=>{await page.goto(process.env.REPRO_URL!);repro.target('target',target);repro.target('reference',reference);await repro.check('ready','Correct page and enabled opener',async()=>{await expect(page.getByRole('heading',{name:'Shipment approval',exact:true})).toBeVisible();await expect(target).toBeEnabled();});await repro.checkpoint('ready');});
await repro.step('trigger',async()=>{await repro.hitTest('hit','target');await repro.checkpoint('hit');const box=await target.boundingBox();if(!box)throw new Error('Missing target bounds');await page.mouse.click(box.x+box.width/2,box.y+box.height/2);});
await repro.step('verify',async()=>{await repro.outcome('result',()=>expect(reference).toHaveText('Shipment approved',{timeout:1500}));await repro.checkpoint('result');});
});
