import { open, rm } from 'node:fs/promises';
/** Exclusive publication ownership. Stale locks fail explicitly, never silently overwrite a writer. */
export async function withFileLock<T>(path:string,work:()=>Promise<T>):Promise<T> {
 const lock=await open(path,'wx').catch((error:unknown)=>{
  if((error as NodeJS.ErrnoException).code==='EEXIST')throw new Error(`Operation is locked by another writer or an interrupted run: ${path}`);
  throw error;
 });
 try {
  await lock.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));
  return await work();
 } finally {await lock.close();await rm(path,{force:true});}
}
