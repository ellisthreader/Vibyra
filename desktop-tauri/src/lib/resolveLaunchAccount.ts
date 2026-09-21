import { connectedAccounts, isAccountRuntime, launchAccountId } from './providerAccountPolicy';
import { useProviderAccountStore } from '../state/providerAccountStore';
import { useProviderDefaultStore } from '../state/providerDefaultStore';

export function resolveLaunchAccount(runtime: string, projectChoice?: string): string | null {
  if (!isAccountRuntime(runtime)) return null;
  const provider = useProviderAccountStore.getState().providers.find(p => p.runtimeId === runtime);
  return launchAccountId(provider ? connectedAccounts(provider) : [], projectChoice,
    useProviderDefaultStore.getState().byRuntime[runtime]);
}
