import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Avatar } from '../ui/Avatar';
import { Hint, Icon } from '../ui/primitives';
import type { WorkspaceModel } from '../ui/types';
import { pickProfilePhoto, type PhotoSource } from './photo';
import { photoSheet } from './photoSheet';
import { settingsAccount } from './whose';
import { Group, Row } from './SettingsRows';

const said = (error: unknown) => error instanceof Error ? error.message : 'Your photo could not be changed. Try again.';

/**
 * The identity card at the top of Settings: the face at its left and the way to
 * change it, then whatever names the person (`children`), the plan as a badge, and —
 * given `onOpen` — the rest of the card as the way to the Profile page. On an iPhone
 * the badge opens the system's own action sheet; elsewhere a short menu opens under
 * the card, without the camera in a browser. A new photo shows at once, dimmed with a
 * spinner while it uploads, and stays if it fails only long enough to say why.
 */
export function ProfilePhoto({ workspace, pick = pickProfilePhoto, children, label, plan, onOpen }: {
  workspace: WorkspaceModel; pick?: (source: PhotoSource) => Promise<string | null>; children?: ReactNode;
  /** What the card opens, in words, for assistive tech. */
  label?: string; plan?: { name: string; paid: boolean } | null; onOpen?: () => void;
}) {
  const { colors, dark } = useTheme();
  const account = settingsAccount(workspace);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [pressed, setPressed] = useState(false);
  const { setAvatar, removeAvatar } = workspace.actions;
  // The sample's photo changes on screen only: its setAvatar keeps the picture in memory.
  const editable = Boolean(account && setAvatar);
  const hasPhoto = Boolean(account?.avatarUrl);
  // A removed photo takes the preview with it; a new one keeps it, so the picture
  // doesn't blink out while the uploaded copy downloads.
  useEffect(() => { if (!account?.avatarUrl) setPreview(null); }, [account?.avatarUrl]);
  const choose = async (source: PhotoSource) => {
    setMenu(false); setError(null);
    let uri: string | null;
    try { uri = await pick(source); } catch (reason) { setError(said(reason)); return; }
    if (!uri || !setAvatar) return;
    setPreview(uri); setBusy(true);
    try { await setAvatar(uri); } catch (reason) { setPreview(null); setError(said(reason)); } finally { setBusy(false); }
  };
  const remove = async () => {
    setMenu(false); setError(null);
    if (!removeAvatar) return;
    setBusy(true);
    try { await removeAvatar(); setPreview(null); } catch (reason) { setError(said(reason)); } finally { setBusy(false); }
  };
  const open = () => {
    if (!photoSheet) { setMenu(!menu); return; }
    const options = ['Take Photo', 'Choose Photo', ...(hasPhoto ? ['Remove Photo'] : []), 'Cancel'];
    photoSheet({ title: 'Profile photo', options, cancelButtonIndex: options.length - 1,
      destructiveButtonIndex: hasPhoto ? 2 : undefined, tintColor: colors.accent, userInterfaceStyle: dark ? 'dark' : 'light' },
    index => { if (index === 0) void choose('camera'); else if (index === 1) void choose('library'); else if (hasPhoto && index === 2) void remove(); });
  };
  const face = <View>
    <Avatar name={workspace.demo && !workspace.account ? 'Sample' : account?.name} email={account?.email} uri={preview ?? account?.avatarUrl} size={52} />
    {busy && <View style={[s.busy, { backgroundColor: 'rgba(0,0,0,0.45)' }]}><ActivityIndicator color="#FFFFFF" /></View>}
    {editable && <View style={[s.badge, { backgroundColor: colors.elevated, borderColor: pressed ? colors.elevated : colors.surface }]}>
      <Icon name="camera-outline" size={12} color={colors.text} />
    </View>}
  </View>;
  const body = <>
    {children}
    {plan && <View style={[s.plan, { backgroundColor: plan.paid ? colors.accentSoft : colors.elevated }]}>
      <Text style={[s.planText, { color: plan.paid ? colors.accent : colors.muted }]}>{plan.name}</Text>
    </View>}
    {onOpen && <View style={s.trail}><Icon name="chevron-forward" size={15} color={colors.muted} /></View>}
  </>;
  return <View style={s.wrap}>
    <View style={[s.card, { backgroundColor: pressed ? colors.elevated : colors.surface, borderColor: colors.border }]}>
      {editable ? <Pressable accessibilityRole="button" accessibilityLabel={hasPhoto ? 'Change profile photo' : 'Add a profile photo'}
        accessibilityState={{ busy, expanded: photoSheet ? undefined : menu }} disabled={busy} onPress={open} hitSlop={8}
        style={({ pressed: down }) => [s.face, { opacity: down ? 0.8 : 1 }]}>{face}</Pressable> : <View style={s.face}>{face}</View>}
      {onOpen ? <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onOpen}
        onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} style={s.body}>{body}</Pressable>
        : <View style={s.body}>{body}</View>}
    </View>
    {menu && <Group style={s.menu}>
      {Platform.OS !== 'web' && <Row title="Take photo" onPress={() => void choose('camera')} trailing="none" />}
      <Row title="Choose photo" onPress={() => void choose('library')} trailing="none" />
      {hasPhoto && <Row title="Remove photo" onPress={() => void remove()} trailing="none" danger />}
      <Row title="Cancel" onPress={() => setMenu(false)} trailing="none" />
    </Group>}
    {error && <View style={s.error}><Hint error>{error}</Hint></View>}
  </View>;
}
const s = StyleSheet.create({
  wrap: { alignSelf: 'stretch' },
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  face: { paddingLeft: 16, paddingVertical: 12 },
  body: { flex: 1, minWidth: 0, minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingLeft: 14, paddingRight: 16, paddingVertical: 12 },
  busy: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', right: -3, bottom: -3, width: 23, height: 23, borderRadius: 12, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center' },
  plan: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  planText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.1 },
  trail: { opacity: 0.7 },
  menu: { marginTop: 12 },
  error: { marginTop: 10, marginHorizontal: 16 },
});
