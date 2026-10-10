import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
if(pkg.name!=='@petercjl/1688cli'||pkg.publishConfig.access!=='public')throw new Error('Invalid distribution contract');
let count=0;
async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await walk(p);else{
 if(e.isSymbolicLink())throw new Error('Unexpected package symlink');
 if(/\.(mjs|json|md|yaml)$/.test(e.name)){
  const s=await fs.readFile(p,'utf8');if(/\/Users\/|C:\\Users\\|-----BEGIN .*PRIVATE KEY-----/.test(s))throw new Error(`Private data pattern: ${path.relative(root,p)}`);
  if(e.name.endsWith('.mjs'))execFileSync(process.execPath,['--check',p]);count++;
 }
}}}
for(const dir of ['src','skill'])await walk(path.join(root,dir));
for(const agent of ['codex','sealseek','workbuddy']){
 const a=JSON.parse(await fs.readFile(path.join(root,'skill/adapters',agent+'.json'),'utf8'));if(a.platform!==agent)throw new Error('Invalid adapter');
}
console.error(JSON.stringify({ok:true,version:pkg.version,checked_files:count}));
