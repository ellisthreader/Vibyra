import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button, Hint } from '../ui/primitives';
import type { Project } from '../ui/types';
import { IntegrationFrame } from './IntegrationFrame';
import { ConnectionGraphic } from './ConnectionGraphic';
import { integrationBrand } from './integrationBrands';
import { Disclosure, Heading, TextAction, sheetStyles as s } from './IntegrationSheetParts';
import { connectedDetail, deviceBlock, railwayProject, vaultProject, type DeviceWorkspace } from './deviceIntegrations';
import type { Integration } from './types';

/** Starting a chat bound to the vault: what the card calls, and how it is going. */
export interface VaultChat {
  /** Why a vault chat cannot start right now, or null. */
  block: string | null; busy: boolean; error: string | null;
  start(project: Project): Promise<void>;
}

/**
 * The card for an integration that lives on the person's own Mac. Same frame,
 * graphic and disclosure as a provider's card, so the page reads as one; what
 * differs is the middle. There is no provider to continue to, so a card that is
 * not connected says what to do on the Mac and offers to look again, and a
 * connected one offers the chat. Nothing here writes anywhere: the Mac is the
 * only place either of these is set up or stopped.
 */
export function DeviceIntegrationSheet({ integration, visible, onClose, workspace, vault, onConnectComputer }: {
  integration: Integration | null; visible: boolean; onClose(): void;
  workspace: DeviceWorkspace & { actions: { refresh(): Promise<void> } };
  vault: VaultChat; onConnectComputer(): void;
}) {
  const [shown, setShown] = useState(integration);
  const [checking, setChecking] = useState(false);
  useEffect(() => { if (integration) setShown(integration); }, [integration]);
  if (!shown) return null;
  const entry = integration ?? shown;
  const name = entry.name;
  const project = entry.id === 'obsidian' ? vaultProject(workspace) : railwayProject(workspace);
  const block = deviceBlock(entry, workspace);
  const checkAgain = async () => {
    setChecking(true);
    try { await workspace.actions.refresh(); } catch { /* the page keeps what it had */ }
    finally { setChecking(false); }
  };

  let content: ReactNode;
  let actions: ReactNode;
  if (entry.installed) {
    content = <>
      <Heading title={`${name} is connected`} detail={connectedDetail(entry)} success />
      <Disclosure key={entry.id} entry={entry} guest={false} />
      {vault.error && project && <Hint error>{vault.error}</Hint>}
    </>;
    actions = project ? <>
      {vault.block && <Hint>{vault.block}</Hint>}
      <Button title="Use it in a chat" icon="arrow-forward" busy={vault.busy} disabled={Boolean(vault.block)}
        onPress={() => { void vault.start(project); }} />
      <TextAction title="Done" onPress={onClose} />
    </> : <>
      <Hint>Chat tools for {name} arrive with the next Mac update. The connection is ready for them.</Hint>
      <TextAction title="Done" onPress={onClose} />
    </>;
  } else {
    content = <>
      <Heading title={`Connect ${name}`} detail={entry.credential.label} />
      <Disclosure key={entry.id} entry={entry} guest={false} />
    </>;
    const offline = workspace.status !== 'connected';
    actions = <>
      {block && <Hint>{block}</Hint>}
      {offline ? <Button title="Connect your computer" icon="desktop-outline" onPress={onConnectComputer} />
        : <Button title="Check again" busy={checking} onPress={() => { void checkAgain(); }} />}
      <TextAction title="Cancel" onPress={onClose} />
    </>;
  }
  return <IntegrationFrame visible={visible} onClose={onClose} label={name}
    footer={<View style={s.actions}>{actions}</View>}>
    <ConnectionGraphic key={entry.id} brand={integrationBrand(entry.id)} connected={entry.installed} />
    {content}
  </IntegrationFrame>;
}
