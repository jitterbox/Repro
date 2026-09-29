import { test, expect } from '@jitterbox/repro-playwright';
test('FA-02 Escape closes the dialog and returns focus to Edit display name.', async ({page,repro})=>{
 const target=page.getByRole('button',{name:'Edit display name',exact:true}); const reference=page.getByRole('link',{name:'Help',exact:true});
 await repro.step('prepare',async()=>{await page.goto(process.env.REPRO_URL!);repro.target('target',target);repro.target('reference',reference);await repro.check('ready','Correct page and enabled opener',async()=>{await expect(page.getByRole('heading',{name:'Workspace settings',exact:true})).toBeVisible();await expect(target).toBeEnabled();});await repro.checkpoint('ready');});
await repro.step('open',async()=>{await target.focus();await page.keyboard.press('Enter');await repro.check('dialog','Dialog opened and input focused',async()=>{await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('textbox',{name:'Display name',exact:true})).toBeFocused();});await repro.checkpoint('dialog');});
await repro.step('trigger',async()=>{await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();});
await repro.step('verify',async()=>{await repro.outcome('result',async()=>{await expect(page.getByRole('dialog')).not.toBeVisible();await expect(target).toBeFocused({timeout:1500});});await repro.checkpoint('result');});
});
