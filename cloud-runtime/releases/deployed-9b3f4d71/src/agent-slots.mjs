/** Fixed identities: private to one bounded task slot; probe can never reap a worker. */
export const AGENT_SLOTS = 3;
export const AGENT_UIDS = [1002,1003,1004,1005];
export function agentSlot(slot, home='/data/agent-home', runs='/data/agent-runs') {
  if (!Number.isInteger(slot)||slot<0||slot>AGENT_SLOTS) throw Error('Invalid Agent slot.');
  const suffix=slot===0?'':slot===AGENT_SLOTS?'-probe':`-${slot}`;
  return {slot,uid:1002+slot,gid:1002+slot,home:home+suffix,runs:runs+suffix};
}
