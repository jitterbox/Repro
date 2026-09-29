import { test, expect } from '@repro/playwright';
test('Invoice total stays aligned after changing account label', async ({ page, repro }) => {
 const total=page.getByLabel('Invoice total',{exact:true});
 const reference=page.getByText('Invoice reference edge',{exact:true});
 async function aligned(){const a=await total.boundingBox();const b=await reference.boundingBox();expect(a).not.toBeNull();expect(b).not.toBeNull();expect(Math.abs(a!.x-b!.x),'Measured total/reference left-edge delta in CSS pixels').toBeLessThanOrEqual(0.5);}
 await repro.step('prepare',async()=>{await page.goto(process.env.REPRO_URL!);repro.target('total',total);repro.target('reference',reference);await expect(page.getByRole('heading',{name:'Billing summary'})).toBeVisible();await repro.check('ready','Initial total aligns with reference',aligned);await repro.checkpoint('ready');});
 await repro.step('trigger',async()=>{await page.getByLabel('Account label').fill('Acme international research and development division');await page.getByRole('button',{name:'Apply label',exact:true}).click();await expect(page.getByText('Acme international research and development division',{exact:true})).toBeVisible();});
 await repro.step('verify',async()=>{await repro.outcome('result',aligned);await repro.checkpoint('result');});
});
