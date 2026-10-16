const id = value => typeof value === 'string' && /^[A-Za-z0-9_:-]{1,128}$/.test(value);
const keys = (value, allowed) => Object.keys(value).every(key => allowed.includes(key));

// Validate before verification/API admission. Never echo JSON parser errors,
// which can contain submitted credentials or encrypted payload fragments.
export function readEnvelope(raw, role) {
  if (!role && raw.length > 6144) throw new Error('Registration envelope too large');
  let value;
  try { value = JSON.parse(raw.toString()); } catch { throw new Error('Invalid envelope'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid envelope');
  if (!role) {
    if (!['host.register', 'client.connect'].includes(value.type) ||
      !keys(value, ['type', 'hostId', 'token', 'name']) || !id(value.hostId) ||
      typeof value.token !== 'string' || !value.token.length || value.token.length > 4096 ||
      (value.name !== undefined && (typeof value.name !== 'string' || value.name.length > 128)))
      throw new Error('Invalid registration envelope');
  } else if (value.type === 'frame') {
    if (!keys(value, ['type', 'clientId', 'data']) || !id(value.clientId) || typeof value.data !== 'string')
      throw new Error('Invalid frame envelope');
  } else if (role === 'host' && value.type === 'client.close') {
    if (!keys(value, ['type', 'clientId']) || !id(value.clientId)) throw new Error('Invalid close envelope');
  } else throw new Error('Invalid envelope');
  return value;
}
