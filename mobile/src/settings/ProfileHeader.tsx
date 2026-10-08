import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import type { WorkspaceModel } from '../ui/types';
import { planNames } from '../vibes/plans';
import { ProfilePhoto } from './ProfilePhoto';
import { useWallet } from './useWallet';
import { isTestAccount, settingsAccount } from './whose';

const titled = (plan: string) => planNames[plan] ?? plan.charAt(0).toUpperCase() + plan.slice(1);

/**
 * Who the sheet belongs to, as the card at its top: the face on the left, the name
 * and email beside it, the plan as a badge, and — with an account that can be
 * edited — the card itself is the way to the Profile page. It reads like the account
 * row of a working tool rather than a centred portrait, so the list starts within the
 * first screen. The sample workspace says it is a sample, because nothing done there
 * is kept. A guest gets `GuestHeader` instead; this only says "Not signed in" when
 * the app has no way to sign in to offer.
 */
export function ProfileHeader({
  workspace,
  onOpenProfile,
}: {
  workspace: WorkspaceModel;
  onOpenProfile?: () => void;
}) {
  const { colors } = useTheme();
  // The signed-in account, or the sample's stand-in, whose name a rename changes too.
  const shown = settingsAccount(workspace);
  const wallet = useWallet();
  // The Test button's account is shown as itself, with one quiet line saying it is a test.
  const test = isTestAccount(workspace);
  const title = shown
    ? shown.name.trim() || shown.email
    : workspace.demo
      ? 'Sample account'
      : 'Not signed in';
  const subtitle =
    workspace.demo && !workspace.account
      ? 'Nothing here is saved'
      : shown?.name.trim()
        ? shown.email
        : null;
  // The plan the wallet knows, else the account's; the sample's stand-in plan is Free.
  const id = wallet?.plan ?? shown?.plan ?? null;
  const plan = !id
    ? null
    : id === 'free' || id === 'sample'
      ? { name: 'Free', paid: false }
      : { name: titled(id), paid: true };
  const label = ['Profile', title, subtitle, plan?.name].filter(Boolean).join(', ');
  return (
    <ProfilePhoto workspace={workspace} plan={plan} label={label} onOpen={onOpenProfile}>
      <View style={s.words}>
        <Text accessibilityRole="header" numberOfLines={1} style={[s.name, { color: colors.text }]}>
          {title}
        </Text>
        {subtitle && (
          <Text numberOfLines={1} style={[s.email, { color: colors.muted }]}>
            {subtitle}
          </Text>
        )}
        {test && (
          <Text numberOfLines={1} style={[s.tag, { color: colors.muted }]}>
            Test account · nothing here is saved
          </Text>
        )}
      </View>
    </ProfilePhoto>
  );
}
const s = StyleSheet.create({
  words: { flex: 1, minWidth: 0, gap: 1 },
  name: { fontSize: 17, fontWeight: '600', letterSpacing: -0.35 },
  email: { fontSize: 14, lineHeight: 19, letterSpacing: -0.1 },
  tag: { fontSize: 12, lineHeight: 16, marginTop: 2 },
});
