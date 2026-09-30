import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { confirmAction } from '../ui/confirm';
import { Button } from '../ui/primitives';
import { IntegrationFrame } from './IntegrationFrame';
import { ConnectionGraphic } from './ConnectionGraphic';
import { useIntegrations } from './IntegrationsProvider';
import { integrationBrand } from './integrationBrands';
import { Consent, Disclosure, Heading, Note, TextAction } from './IntegrationSheetParts';
import type { Integration } from './types';

/** One guest-friendly connection card: consent, provider sign-in, then confirmed access. */
export function IntegrationSheet({
  integration,
  visible,
  onClose,
  onUse,
  signedIn = true,
}: {
  integration: Integration | null;
  visible: boolean;
  onClose(): void;
  onUse(mention: string): void;
  /** Only changes the guest persistence explanation; never gates connecting. */
  signedIn?: boolean;
}) {
  const { catalogue, live, busy, error, refresh, authorize, disconnect } = useIntegrations();
  const card = useRef('');
  card.current = visible ? (integration?.id ?? '') : '';
  // What went wrong in this card, kept here so one service's refusal is never shown for another.
  const [failure, setFailure] = useState<string | null>(null);
  // The card keeps drawing the last service while it slides away after the parent lets go.
  const [shown, setShown] = useState(integration);
  useEffect(() => {
    if (integration) setShown(integration);
  }, [integration]);
  useEffect(() => {
    if (visible) setFailure(null);
  }, [integration?.id, visible]);
  // Letting go of the card cancels the sign-in it started, so the provider sheet
  // cannot open over a screen the person has already moved on to.
  const attempt = useRef<AbortController | null>(null);
  useEffect(() => () => attempt.current?.abort(), []);
  const close = () => {
    attempt.current?.abort();
    attempt.current = null;
    onClose();
  };
  if (!shown) return null;
  // The prop is a snapshot; connecting changes the catalogue, not the row that opened this.
  const entry = catalogue.integrations.find((item) => item.id === shown.id) ?? shown;
  const name = entry.name;
  // Only this card is busy when this card is the one working.
  const working = busy === entry.id;
  const reason = (e: unknown) =>
    e instanceof Error ? e.message : 'That did not work. Please try again.';
  const signInWithProvider = async () => {
    setFailure(null);
    const control = new AbortController();
    attempt.current = control;
    try {
      await authorize(entry.id, control.signal);
    } catch (e) {
      // Cancelling can race an approval the provider already completed; let the server settle it.
      if (control.signal.aborted) void refresh();
      else if (card.current === entry.id) setFailure(reason(e));
    } finally {
      if (attempt.current === control) attempt.current = null;
    }
  };

  let content: ReactNode;
  let actions: ReactNode;
  let consent: ReactNode = null;
  if (entry.installed) {
    content = (
      <>
        <Heading
          title={`${name} is connected`}
          detail={entry.account ? `Connected as ${entry.account}` : undefined}
          success
        />
        <Disclosure key={entry.id} entry={entry} guest={!signedIn} />
        {failure && <Note error>{failure}</Note>}
      </>
    );
    actions = (
      <>
        <Button
          title="Use it in a chat"
          icon="arrow-forward"
          onPress={() => onUse(entry.mention)}
        />
        {/* Disconnecting revokes access at once and cannot be undone here, so it is asked about first. */}
        <TextAction
          title={`Disconnect ${name}`}
          danger
          disabled={working}
          onPress={() =>
            confirmAction(
              `Disconnect ${name}?`,
              `Vibyra will no longer have access to your ${name} account.`,
              'Disconnect',
              () => {
                setFailure(null);
                void disconnect(entry.id).catch((e) => {
                  if (card.current === entry.id) setFailure(reason(e));
                });
              },
            )
          }
        />
        <TextAction title="Done" onPress={close} />
      </>
    );
  } else {
    // Missing provider configuration is unavailable, never a request for a key.
    const blocked = !live
      ? (error ?? 'Checking your integrations…')
      : !catalogue.enabled
        ? 'Integrations are not available right now.'
        : entry.credential.configured === false
          ? `${name} sign-in is not available right now. Please try again later.`
          : null;
    content = (
      <>
        <Heading title={`Connect ${name}`} detail={`Sign in to ${name} to approve access.`} />
        <Disclosure key={entry.id} entry={entry} guest={!signedIn} />
      </>
    );
    // Beside the button it qualifies, so it is on screen whenever the button is; a
    // sign-in that did not finish says why in the same place.
    consent = (
      <>
        {failure && <Note error>{failure}</Note>}
        <Consent />
      </>
    );
    // Withheld, the card says why and offers the one thing that can change it as a
    // real button, so the way forward never reads as a caption.
    actions = (
      <>
        {blocked ? (
          <>
            <Note error>{blocked}</Note>
            {(error || live) && (
              <View style={s.retry}>
                <Button title="Try again" secondary onPress={() => void refresh()} />
              </View>
            )}
          </>
        ) : (
          <Button
            title={`Continue to ${name}`}
            busy={working}
            onPress={() => void signInWithProvider()}
          />
        )}
        <TextAction title="Cancel" onPress={close} />
      </>
    );
  }
  return (
    <IntegrationFrame
      visible={visible}
      onClose={close}
      label={name}
      footer={
        <>
          {consent}
          <View style={s.actions}>{actions}</View>
        </>
      }
    >
      <ConnectionGraphic
        key={entry.id}
        brand={integrationBrand(entry.id)}
        connected={entry.installed}
      />
      {content}
    </IntegrationFrame>
  );
}

const s = StyleSheet.create({
  actions: { gap: 4 },
  retry: { marginTop: 8 },
});
