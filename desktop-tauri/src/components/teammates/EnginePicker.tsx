import { teammateProviders, engineProvider, providerPreference } from '../../../../mobile/src/agents/engineProviders';
import { brandFor } from '../../../../mobile/src/ui/brands';
export function EnginePicker({ model, onChange }: { model?: string; onChange(model: string): void }) {
  const selected = engineProvider(model);
  return <div className="profile-picks"><h3>Engine</h3><p className="profile-help">Choose a provider. Vibyra picks the model for each task.</p>
    <div className="engine-grid" role="radiogroup" aria-label="AI provider">{teammateProviders.map(provider => {
      const logo = provider.id === 'auto' ? null : brandFor(provider.id);
      return <button type="button" className="engine-provider" role="radio" aria-label={provider.name} aria-checked={selected === provider.id} key={provider.id} onClick={() => onChange(providerPreference(provider.id))}>
        {logo ? <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">{logo.paths ? logo.paths.map(part => <path key={part.fill} d={part.d} fill={part.fill} />) : <path d={logo.path} fill={logo.color ?? 'currentColor'} />}</svg> : <span className="engine-auto" aria-hidden="true">✦</span>}<span>{provider.name}</span><span className="engine-selected" aria-hidden="true">{selected === provider.id ? '●' : '○'}</span>
      </button>;
    })}</div>
    {!teammateProviders.some(p => p.id === selected) && <p className="profile-help">Choose a provider to replace the previously saved engine.</p>}
  </div>;
}
