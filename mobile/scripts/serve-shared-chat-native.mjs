import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { sharedChatProbe } from './shared-chat-probe.mjs';
const udid = process.env.VIBYRA_TEST_UDID ?? '53D994E2-A8F9-408C-BAB8-725EA9BB897A';
if (['CE6F7E36-B33A-4301-AFA4-5E7107F65AF6', '258E794C-4AA5-4FA8-AE7D-8ACB070786D5'].includes(udid)) throw new Error('Use a dedicated automation simulator.');
const probe = await sharedChatProbe();
const manifest = await fetch('http://127.0.0.1:8081', { headers: { 'expo-platform':'ios' } }).then(r => r.json());
const bundle = new URL(manifest.launchAsset.url); bundle.pathname = '/tests/nativeSharedChatFixture.tsx.bundle';
manifest.launchAsset.url = bundle.toString(); manifest.extra.expoGo.mainModuleName = 'tests/nativeSharedChatFixture.tsx';
manifest.extra.scopeKey = '@anonymous/shared-desktop-fixture';
const warm = await fetch(bundle); if (!warm.ok) throw new Error(await warm.text()); await warm.arrayBuffer();
const server = createServer(async (req,res) => {
 res.setHeader('content-type','application/json');
 if (req.url === '/config') res.end(JSON.stringify({invitation:JSON.stringify(probe.pairing)}));
 else if (req.url === '/result') {let body='';for await(const chunk of req)body+=chunk; writeFileSync('/tmp/vibyra-shared-native-state.json',body);res.end('{}');}
 else if (req.url === '/desktop') {res.end(JSON.stringify(await probe.local('conversation.snapshot',{sessionId:probe.session.id})));}
 else {res.setHeader('content-type','application/expo+json');res.setHeader('expo-protocol-version','0');res.end(JSON.stringify({...manifest,id:randomUUID(),createdAt:new Date().toISOString()}));}
});
await new Promise(resolve => server.listen(8094,'127.0.0.1',resolve));
execFileSync('xcrun',['simctl','openurl',udid,'vibyra://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8094']);
console.log(`Native shared Desktop fixture ready on ${udid}. Project ${probe.dir}. State /tmp/vibyra-shared-native-state.json`);
process.on('SIGTERM',async()=>{server.close();await probe.close();process.exit();});
