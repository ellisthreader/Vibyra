import assert from 'node:assert/strict';

export async function verifySidebarRecovery({ browser, server, out }) {
 const sync = await browser.newPage({viewport:{width:1180,height:800}});
 await sync.goto(`http://127.0.0.1:${server.address().port}/?connector-sync&theme=light`);
 await sync.evaluate(()=>window.dispatchEvent(new CustomEvent('fixture-safe',{detail:true})));
 await sync.getByRole('tab',{name:'Worktrees',exact:true}).click();
 await sync.getByRole('button',{name:'Open repository on GitHub'}).waitFor();
 assert.equal(await sync.locator('.worktree-repo .integration-logo--github svg').count(),1);
 await sync.evaluate(()=>window.dispatchEvent(new Event('fixture-slow-catalogue')));
 await sync.getByRole('button',{name:'Refresh GitHub connection'}).click();
 assert.ok(await sync.getByRole('button',{name:'Open repository on GitHub'}).isVisible(),'refresh preserves verified connection');
 await sync.waitForTimeout(650);
 assert.ok(await sync.getByRole('button',{name:'Open repository on GitHub'}).isVisible());
 await sync.getByRole('button',{name:'Refresh GitHub connection'}).click();
 await sync.evaluate(()=>window.dispatchEvent(new Event('fixture-settings-disconnect')));
 await sync.getByRole('button',{name:'Connect GitHub',exact:true}).waitFor();
 await sync.waitForTimeout(650);
 assert.equal(await sync.getByRole('button',{name:'Open repository on GitHub'}).count(),0,'late connected response cannot undo Settings disconnect');
 assert.equal(await sync.getByRole('button',{name:/files changed/}).count(),0);
 await sync.screenshot({path:`${out}/github-disconnected.png`});
 await sync.getByRole('tab',{name:'Chat',exact:true}).click();
 await sync.getByRole('button',{name:'Conversation options'}).click();
 await sync.getByRole('menuitem',{name:'Clear conversation'}).click();
 await sync.screenshot({path:`${out}/chat-empty-light.png`});
 await sync.close();
 const failure = await browser.newPage({viewport:{width:960,height:600}});
 await failure.goto(`http://127.0.0.1:${server.address().port}/?preview-error`);
 await failure.getByRole('tab',{name:'Preview',exact:true}).click();
 await failure.getByRole('button',{name:'Run preview',exact:true}).click();
 await failure.getByText('Preview could not start',{exact:true}).waitFor();
 await failure.getByText(/Expo web needs its web dependencies/).waitFor();
 await failure.getByText('Startup details',{exact:true}).click();
 await failure.getByText('Missing web dependencies: react-native-web',{exact:true}).waitFor();
 await failure.getByRole('textbox',{name:'Preview URL'}).fill(`http://localhost:${server.address().port}/sample-preview`);
 await failure.getByRole('button',{name:'Open URL',exact:true}).click();
 await failure.frameLocator('iframe').getByLabel('Preview form').fill('Recovered from error');
 await failure.close();
}
