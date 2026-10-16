import { readCloudAgentToken, cloudAccountIdentity } from './agent-login.mjs';
import { agentChild } from './agent-process.mjs';
import { AGENT_SLOTS, agentSlot } from './agent-slots.mjs';
import { browserSupervisor } from './agent-browser.mjs';
const CAPABILITIES = Object.freeze({ controlledTools: true, adapter: 'claude-stream-json', brokerOnly: true,
  interrupt: true, taskSteering: true, pinnedSkillsV1: true, parallelJobsV1: true, workerSlots: AGENT_SLOTS,
  preflight: 'initialize+mcp_status', computerTools: false, browserTools: false, localMcp: false });

/** Each slot owns its provider, private context and OS identity until cleanup completes. */
export function startAgents({ client, scope, origin, home, uid = null, gid = null, valid,
  readToken = readCloudAgentToken,
  bin = '/usr/local/bin/vibyra-cloud-agent', child = agentChild, delayMs = 3000, credentialPollMs = 5000,
  browserBin, browserHome, browserChild }) {
  let stopped = false, registered = null, discoveredAt = 0, discovered = null, token = null;
  let timer = null, epoch = 0, pending = Promise.resolve(), registrationRequired = false;
  const workers = Array(AGENT_SLOTS).fill(null);
  const okay = () => !stopped && valid();
  const browser=browserSupervisor({bin:browserBin,home:browserHome,origin,uid:uid===null?null:1006,gid:gid===null?null:1006,
    valid:okay,...(browserChild?{child:browserChild}:{})});
  const launch = async (slot, args, input, timeout) => {
    const identity = agentSlot(slot, home), started = epoch;
    let unchanged = true, checking = false;
    const monitor = setInterval(async () => { if (checking) return; checking = true;
      try { unchanged = unchanged && await readToken() === input.oauthToken; } catch { unchanged = false; }
      finally { checking = false; }
    }, credentialPollMs);
    try { return await child({ bin, args, input, timeout, home: identity.home,
      uid: uid === null ? null : identity.uid, gid: gid === null ? null : identity.gid,
      valid: () => okay() && epoch === started && unchanged }); }
    finally { clearInterval(monitor); }
  };
  async function stopWorkers() {
    epoch++;
    await Promise.all([...workers.filter(Boolean),browser.stop()]);
    registered = null;
  }
  async function step() {
    if (!okay()) { await stopWorkers(); return; }
    const current = await readToken();
    if (current !== token) {
      await stopWorkers(); token = current; discovered = null;
    }
    if (!discovered || Date.now() - discoveredAt >= 30000) {
      discovered = token ? JSON.parse(await launch(AGENT_SLOTS, ['--probe'], { oauthToken: token }, 30000)) : { accounts: [] };
      if (!Array.isArray(discovered.accounts)) throw Error('Invalid Cloud account discovery.');
      await client.call('/agents/accounts', { generation: scope.generation, accounts: discovered.accounts });
      discoveredAt = Date.now();
    }
    const { selection } = await client.call('/agents/next');
    const account = selection && discovered.accounts.find(a => a.provider === selection.provider
      && a.accountId === selection.accountId && a.authenticated === true);
    if (!account || selection.provider !== 'claude' || !/^cloud-[a-f0-9]{32}$/.test(selection.accountId)) {
      await stopWorkers(); return;
    }
    const signature = JSON.stringify({ selection, version: discovered.providerVersion, generation: scope.generation });
    if (registrationRequired || registered?.signature !== signature) {
      await stopWorkers(); registrationRequired = false;
      const browserCapabilities=await browser.probe();
      const registration = await client.call('/agents/register', { generation: scope.generation, runtimeId: selection.runtimeId,
        provider: selection.provider, accountId: selection.accountId, model: selection.model, effort: selection.effort ?? null,
        providerVersion: discovered.providerVersion, capabilities: {...CAPABILITIES,...browserCapabilities} });
      if (registration.runtimeId !== selection.runtimeId || typeof registration.runnerKey !== 'string' || registration.runnerKey.length !== 64
        || registration.selection?.provider !== selection.provider || registration.selection?.accountId !== selection.accountId
        || registration.selection?.model !== selection.model || (registration.selection?.effort ?? null) !== (selection.effort ?? null)) throw Error('Cloud binding changed.');
      registered = { signature, runtimeId: registration.runtimeId, runnerKey: registration.runnerKey, browserKey:registration.browserKey };
    }
    const oauthToken = await readToken();
    if (!oauthToken || oauthToken !== token || cloudAccountIdentity(oauthToken) !== selection.accountId) {
      await stopWorkers(); discovered = null; return;
    }
    if (!okay()) return;
    browser.start(registered.runtimeId,registered.browserKey);
    for (let slot = 0; slot < AGENT_SLOTS; slot++) {
      if (workers[slot]) continue;
      workers[slot] = launch(slot, [], { oauthToken, origin, workerSlot: slot,
        runtimeId: registered.runtimeId, runnerKey: registered.runnerKey,
        selection: { provider: selection.provider, account: selection.accountId, model: selection.model, effort: selection.effort ?? null } })
        .then(output => { if (output && JSON.parse(output).registrationRequired === true) registrationRequired = true; })
        // An individual failed attempt must not rotate peers' keys or replay its task locally.
        .catch(() => {}).finally(() => { workers[slot] = null; });
    }
  }
  function tick() { pending = pending.catch(() => {}).then(step); return pending; }
  async function loop() {
    try { await tick(); } catch { discovered = null; }
    if (!stopped) timer = setTimeout(loop, delayMs);
  }
  void loop();
  return { async stop() { stopped = true; epoch++; clearTimeout(timer); await pending.catch(() => {}); await stopWorkers(); }, tick };
}
