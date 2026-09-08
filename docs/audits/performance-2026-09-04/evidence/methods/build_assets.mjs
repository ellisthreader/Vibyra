import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
const [surface, probe] = process.argv.slice(2);
const root = '/home/ellis/Desktop/Vibyra/' + (surface === 'desktop' ? 'desktop-tauri' : 'backend');
const out = '/tmp/vibyra-performance-audit-20260904-KNtjVg';
const label = surface + (probe ? '-probe' : '');
process.chdir(root);
if (probe) process.env.VITE_LATENCY_PROBE = '1';
const { build } = await import(resolve(root, 'node_modules/vite/dist/node/index.js'));
await build({root, configFile: resolve(root, surface === 'desktop' ? 'vite.config.ts' : 'vite.config.js'),
 build: {outDir:out+'/'+label+'-dist', emptyOutDir:true, manifest:true},
 plugins: [{name:'audit-bundle-inventory',generateBundle(options,bundle){
 const result=Object.values(bundle).map(item=>({file:item.fileName,type:item.type,entry:item.isEntry??false,imports:item.imports??[],dynamicImports:item.dynamicImports??[],bytes:Buffer.byteLength(item.type==='chunk'?item.code:item.source),gzipBytes:gzipSync(item.type==='chunk'?item.code:item.source).length,modules:item.type==='chunk'?Object.entries(item.modules).map(([id,m])=>({id:id.replace(root+'/',''),renderedLength:m.renderedLength})).sort((a,b)=>b.renderedLength-a.renderedLength):undefined}));
 writeFileSync(out+'/'+label+'-bundle.json',JSON.stringify(result,null,2));
 }}]
});
