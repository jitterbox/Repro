import { mkdtemp, writeFile, utimes, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { ReproConfigSchema } from '@jitterbox/repro-core';
import { captureStageCacheKey } from './capture-session.js';
it('invalidates explicit capture reuse when HAR bytes change with unchanged modification time', async () => {
  const directory = await mkdtemp(join(tmpdir(),'repro-har-key-'));
  try {
    const path = join(directory,'replay.har');await writeFile(path,'first');
    const config = ReproConfigSchema.parse({mode:'repro',profile:'controlled',surfaceCapture:'page',viewport:{width:1280,height:720},capture:{har:path}});
    const before = captureStageCacheKey({config}), info = await stat(path);
    await writeFile(path,'other');await utimes(path,info.atime,info.mtime);
    expect(captureStageCacheKey({config})).not.toBe(before);
    await rm(path);expect(() => captureStageCacheKey({config})).toThrow();
  } finally {await rm(directory,{recursive:true,force:true});}
});
