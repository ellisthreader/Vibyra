import { styles as s } from './ReportPageStyles';
import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { reportContext } from '../../report/context';
import { pickReportImage } from '../../report/image';
import { useTheme } from '../../theme';
import { useSheetBottomInset } from '../../ui/OverlaySheet';
import { Button, EmptyState, Hint, Icon } from '../../ui/primitives';
import type { SettingsPageProps } from '../pages';

export function ReportPage({ workspace, nav }: SettingsPageProps) {
  const { colors } = useTheme();
  const bottom = useSheetBottomInset();
  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);
  const context = reportContext(workspace);
  const account = workspace.account;
  const available = Boolean(account && workspace.reports && !workspace.demo);
  const ready = Boolean(summary.trim() && details.trim() && !busy);

  const attach = async () => {
    setError(null);
    try {
      const picked = await pickReportImage();
      if (picked) setImage(picked);
    } catch {
      setError('That image could not be added. Choose another.');
    }
  };
  const send = async () => {
    if (!ready || !workspace.reports) return;
    setBusy(true);
    setError(null);
    try {
      setSentId(await workspace.reports.send({ summary, details, context, imageUri: image }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The report could not be sent.');
    } finally {
      setBusy(false);
    }
  };

  if (sentId)
    return (
      <View style={s.result}>
        <EmptyState
          icon="checkmark-circle-outline"
          title="Report sent"
          detail={`Reference ${sentId}. Thank you for helping improve Vibyra.`}
        />
        <Button title="Done" onPress={nav.back} />
      </View>
    );
  if (!available)
    return (
      <View style={s.result}>
        <EmptyState
          icon="chatbubble-ellipses-outline"
          title={workspace.demo ? 'Leave the sample to report' : 'Sign in to report'}
          detail={
            workspace.demo
              ? 'Reports are sent from your real Vibyra account.'
              : 'Your account lets us follow up on a problem.'
          }
        />
        <Button
          title={workspace.demo ? 'Back to Settings' : 'Sign in'}
          onPress={workspace.demo ? nav.back : () => nav.signIn('login')}
        />
      </View>
    );

  return (
    <View style={s.page}>
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[s.intro, { color: colors.muted }]}>
          A short note helps us find and fix the problem.
        </Text>
        <View style={[s.fields, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={s.field}>
            <Text style={[s.fieldLabel, { color: colors.muted }]}>Summary</Text>
            <TextInput
              accessibilityLabel="Summary"
              value={summary}
              onChangeText={setSummary}
              placeholder="What went wrong?"
              placeholderTextColor={colors.muted}
              maxLength={300}
              returnKeyType="next"
              style={[s.summary, { color: colors.text }]}
            />
          </View>
          <View style={[s.rule, { backgroundColor: colors.border }]} />
          <View style={s.field}>
            <Text style={[s.fieldLabel, { color: colors.muted }]}>Details</Text>
            <TextInput
              accessibilityLabel="Details"
              value={details}
              onChangeText={setDetails}
              placeholder="What happened? What did you expect?"
              placeholderTextColor={colors.muted}
              maxLength={8000}
              multiline
              textAlignVertical="top"
              style={[s.details, { color: colors.text }]}
            />
          </View>
        </View>
        <View
          style={[s.attachment, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={image ? 'Change screenshot' : 'Add screenshot'}
            onPress={() => void attach()}
            style={s.attachAction}
          >
            {image ? (
              <Image
                source={{ uri: image }}
                style={s.image}
                resizeMode="cover"
                accessibilityLabel="Selected report image"
              />
            ) : (
              <View style={[s.imageIcon, { backgroundColor: colors.elevated }]}>
                <Icon name="image-outline" size={20} color={colors.muted} />
              </View>
            )}
            <View style={s.attachText}>
              <Text style={[s.attachTitle, { color: colors.text }]}>
                {image ? 'Change screenshot' : 'Add screenshot'}
              </Text>
              <Text style={[s.attachHint, { color: colors.muted }]}>
                {image ? 'Attached' : 'Optional'}
              </Text>
            </View>
            <Icon name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
          {image && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove screenshot"
              onPress={() => setImage(null)}
              style={s.remove}
            >
              <Icon name="close" size={17} color={colors.muted} />
            </Pressable>
          )}
        </View>
        <View style={s.included}>
          <Icon name="information-circle-outline" size={17} color={colors.muted} />
          <Text style={[s.includedText, { color: colors.muted }]}>
            Sent as {account?.name ? `${account.name} · ` : ''}
            {account?.email} from {context.hardware} ({context.platform}). Includes app version,
            screen, request IP and selected project folder when available. Delivered to Vibyra’s
            Discord report channel.
          </Text>
        </View>
      </ScrollView>
      <View
        style={[
          s.footer,
          { paddingBottom: bottom + 12, backgroundColor: colors.rail, borderColor: colors.border },
        ]}
      >
        {error && (
          <View style={s.error}>
            <Hint error>{error}</Hint>
          </View>
        )}
        <Button title="Send report" busy={busy} disabled={!ready} onPress={() => void send()} />
      </View>
    </View>
  );
}
