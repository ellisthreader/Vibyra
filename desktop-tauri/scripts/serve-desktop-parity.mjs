import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const desktop = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(desktop, '../output/linux-parity-preview');
await mkdir(output, {recursive:true});
const main = await readFile(resolve(desktop,'src/main.tsx'),'utf8');
const styles = [...main.matchAll(/import "(\.\/styles\/[^\"]+)"/g)]
  .map(match => `import ${JSON.stringify(match[1].replace('./','/src/'))};`).join('\n');
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Vibyra desktop parity fixture</title>
<script>
Object.defineProperty(navigator,'platform',{value:new URLSearchParams(location.search).get('platform')==='mac'?'MacIntel':'Linux x86_64'});
addEventListener('error',e=>fetch('/evidence',{method:'POST',body:JSON.stringify({error:e.message,query:location.search})}));
addEventListener('unhandledrejection',e=>fetch('/evidence',{method:'POST',body:JSON.stringify({error:String(e.reason),query:location.search})}));
</script></head><body><div id="root"></div><script type="module">
${styles}
import '/tests/desktopParityFixture.tsx';
</script></body></html>`;
const server = await createServer({root:desktop,configFile:resolve(desktop,'vite.config.ts'),
  server:{host:'127.0.0.1',port:1427,strictPort:true},plugins:[{name:'parity-fixture',configureServer(server){
    server.middlewares.use(async(req,res,next)=>{
      if(req.url?.split('?')[0] === '/compare') {
        const query = new URL(req.url,'http://localhost').searchParams;
        const screen = query.get('screen') ?? 'workspace';
        const theme = query.get('theme') ?? 'dark';
        const width = Number(query.get('width')) === 960 ? 960 : 1280;
        const frames = ['mac','linux'].map(platform => {
          const url = '/desktop-parity.html?' + new URLSearchParams({platform,screen,theme});
          return `<section><h2>${platform === 'mac' ? 'macOS 0.7.8 reference' : 'Linux candidate'}</h2><div class="frame"><iframe title="${platform}" width="${width}" height="800" src="${url.replaceAll('&','&amp;')}"></iframe></div></section>`;
        }).join('');
        res.setHeader('Content-Type','text/html');
        res.end(`<!doctype html><meta charset="utf-8"><title>Mac and Linux component comparison</title><style>body{margin:24px;background:#202329;color:white;font:14px system-ui}.pair{display:flex;gap:16px;flex-wrap:wrap}h2{font-size:15px}.frame{width:${width*.54}px;height:432px}iframe{border:0;transform:scale(.54);transform-origin:top left}</style><h1>Vibyra desktop parity review</h1><p>Shipping components at ${width} × 800. Mocked OS labels and IPC in the same browser; native OS rasterization is a separate check.</p><div class="pair">${frames}</div>`);return;
      }
      if(req.url === '/evidence' && req.method === 'POST') {
        let body='';for await (const chunk of req) {body+=chunk;if(body.length>100000){res.statusCode=413;res.end();return;}}
        try {await appendFile(resolve(output,'layout.ndjson'),JSON.stringify(JSON.parse(body))+'\n');res.end('ok');}
        catch {res.statusCode=400;res.end('invalid evidence');}return;
      }
      if(req.url?.split('?')[0] !== '/desktop-parity.html') return next();
      res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/desktop-parity.html',html));
    });
  }}]});
await server.listen();
console.log('Sample-only desktop review: http://127.0.0.1:1427/desktop-parity.html?platform=linux&screen=workspace&theme=dark');
