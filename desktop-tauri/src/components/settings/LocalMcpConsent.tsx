import { useEffect, useState } from 'react';
import { localMcpApi } from '../../lib/localMcpApi';
import { commandLine, envFromRows, missingFields, rowsFromEnv, type EnvRow, type LocalSpec, type Preset } from '../../lib/localMcp';
import { useDialogFocus } from '../teammates/useDialogFocus';

interface Props { initial: LocalSpec; preset: Preset | null; secretsSaved: string[]; busy: boolean; error: string;
  onCancel(): void; onConfirm(spec: LocalSpec, secrets: Record<string, string>): void }

/** The one consent step: exactly what will run, where, and with which variable names. Nothing runs before Add. */
export function LocalMcpConsent({ initial, preset, secretsSaved, busy, error, onCancel, onConfirm }: Props) {
  const ref = useDialogFocus(true, onCancel) as React.RefObject<HTMLDivElement>;
  const [name, setName] = useState(initial.name);
  const [values, setValues] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState({ command: initial.command, args: initial.args.join('\n'), cwd: initial.cwd ?? '' });
  const [rows, setRows] = useState<EnvRow[]>(rowsFromEnv(initial));
  const [agreed, setAgreed] = useState(false), [check, setCheck] = useState<{ problem: string | null; unpinned: boolean } | null>(null);
  const built = preset ? preset.build(values) : null;
  const spec: LocalSpec = { ...initial, name: name.trim(), preset: preset?.id ?? initial.preset, ...envFromRows(rows),
    ...(built ? { command: built.command, args: built.args, cwd: built.cwd, env: { ...built.env, ...envFromRows(rows).env } }
      : { command: custom.command.trim(), args: custom.args.split('\n').map(a => a.trim()).filter(Boolean), cwd: custom.cwd.trim() || null }) };
  const lacking = preset ? missingFields(preset, values) : [];
  useEffect(() => { let live = true; void localMcpApi.check(spec).then(r => live && setCheck(r), () => live && setCheck(null)); return () => { live = false; }; }, [JSON.stringify(spec)]);
  const pick = async (key: 'folder' | 'file', label: string) => {
    const path = await localMcpApi.pick(key, `Choose ${label.toLowerCase()}`);
    if (path) setValues(v => ({ ...v, [key]: path }));
  };
  const ready = Boolean(name.trim()) && agreed && lacking.length === 0 && !check?.problem && !busy;
  const names = [...Object.keys(spec.env), ...spec.secretEnv];
  return <div className="local-mcp-scrim"><div className="local-mcp-dialog" role="dialog" aria-modal="true" aria-label="Add a local MCP server" ref={ref}>
    <h3>{initial.id ? 'Edit' : 'Add'} {preset?.name ?? 'a local MCP server'}</h3>
    <label className="local-mcp-field"><span>Name</span><input className="input" aria-label="Server name" value={name} maxLength={80} onChange={e => setName(e.target.value)} /></label>
    {preset?.fields.map(f => <label key={f.key} className="local-mcp-field"><span>{f.label}</span><small>{f.hint}</small>
      <span className="hub-paste"><input className="input" aria-label={f.label} placeholder={f.placeholder} value={values[f.key] ?? ''} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} />
        <button type="button" className="btn btn--ghost btn--compact" onClick={() => void pick(f.key, f.label)}>Choose…</button></span></label>)}
    {preset ? null : <>
      <label className="local-mcp-field"><span>Command</span><input className="input" aria-label="Command" placeholder="npx" value={custom.command} onChange={e => setCustom({ ...custom, command: e.target.value })} /></label>
      <label className="local-mcp-field"><span>Arguments</span><small>One per line.</small><textarea className="input" aria-label="Arguments" rows={3} value={custom.args} onChange={e => setCustom({ ...custom, args: e.target.value })} /></label>
      <label className="local-mcp-field"><span>Working folder</span><input className="input" aria-label="Working folder" placeholder="Optional full path" value={custom.cwd} onChange={e => setCustom({ ...custom, cwd: e.target.value })} /></label>
    </>}
    <fieldset className="local-mcp-field"><legend>Environment variables</legend>
      {rows.map((r, i) => <span key={i} className="local-mcp-env">
        <input className="input" aria-label={`Variable ${i + 1} name`} placeholder="NAME" value={r.name} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
        <input className="input" aria-label={`Variable ${i + 1} value`} type={r.secret ? 'password' : 'text'} placeholder={r.secret && secretsSaved.includes(r.name) ? 'Saved — leave blank to keep' : 'value'}
          value={r.value} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
        <label><input type="checkbox" aria-label={`Variable ${i + 1} is a secret`} checked={r.secret} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, secret: e.target.checked } : x))} /> Secret</label>
        <button type="button" className="btn btn--ghost btn--compact" aria-label={`Remove variable ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button></span>)}
      <button type="button" className="btn btn--ghost btn--compact" onClick={() => setRows([...rows, { name: '', value: '', secret: false }])}>Add a variable</button>
    </fieldset>
    <div className="local-mcp-run" aria-label="What will run">
      <strong>What will run on this Mac</strong>
      <code>{spec.command ? commandLine(spec) : '—'}</code>
      <small>Working folder: {spec.cwd ?? 'none set'}</small>
      <small>Environment: a standard set (PATH, HOME, language, proxies){names.length ? `, plus ${names.join(', ')}` : ''}. Vibyra’s own keys are never passed. Secret values stay in your Keychain.</small>
    </div>
    {check?.unpinned ? <p className="hub-error" role="alert">This launcher downloads and runs code each time it starts, and it isn’t pinned to a version. Pin it (for example <code>package@1.2.3</code>) so it can’t change under you.</p> : null}
    {check?.problem ? <p className="hub-error" role="alert">{check.problem}</p> : null}
    {error ? <p className="hub-error" role="alert">{error}</p> : null}
    <label className="local-mcp-agree"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} /> I understand this runs on my Mac with my own permissions and isn’t sandboxed.</label>
    <div className="hub-actions"><button type="button" className="btn btn--ghost" onClick={onCancel}>Cancel</button>
      <button type="button" className="btn btn--primary" disabled={!ready} onClick={() => onConfirm(spec, Object.fromEntries(rows.filter(r => r.secret && r.value && r.name.trim()).map(r => [r.name.trim(), r.value])))}>{busy ? 'Starting…' : initial.id ? 'Save' : 'Add server'}</button></div>
  </div></div>;
}
