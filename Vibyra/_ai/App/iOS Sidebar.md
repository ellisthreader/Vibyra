# iOS Sidebar

The maintained sidebar is `mobile/src/ui/NavigationDrawer.tsx`; chat rows,
filter tabs and empty states live in `DrawerSessionList.tsx`. It uses the
Graphite+Cobalt tokens in `mobile/src/theme.ts`: one solid New chat action,
plain navigation icons, quiet list rows and a thin cobalt selection marker.
Keep Show welcome again in Settings, rather than repeating it in navigation.

The transparent native Modal uses `presentationStyle="overFullScreen"` and
its own slide/scrim animation (`animationType="none"`). Keep it mounted through
the closing transition and honor Reduce Motion. The panel is positioned at
top/left/bottom zero with a square lower edge; rounded bottom corners exposed
the scrim and made the rail appear detached from the screen.

Read `useSafeAreaInsets()` outside the Modal. The native SafeAreaView cannot
walk through a Modal to its provider under the New Architecture. Apply the top
inset to the panel content and the bottom inset inside the pinned Settings
footer; the rail background must paint underneath both. Do not give the
Settings title `flex: 1` inside its vertical text stack: it stretches the footer.
The Modal also owns a theme-aware StatusBar entry while mounted.

Search stays above a single scrolling navigation/chat area, including optional
`extraChats`. Do not move additional chat lists into a fixed header: they can
push the list/footer offscreen. ScrollView automatic content insets are disabled
because the panel/footer already own them. Selected computer sessions are only
highlighted while the Work destination is active.

Run `node mobile/scripts/verify-drawer-ui.mjs` with the maintained Metro active.
It checks full-height geometry, footer reachability, background accessibility,
search/project matching, filter ARIA state, selection, navigation, dismissal and
empty states in both themes at compact/large/landscape/wide sizes, with and
without Reduce Motion. Screenshots default to `/tmp/vibyra-sidebar-screenshots`.
Native preview uses `VIBYRA_FIXTURE_ENTRY=tests/nativeDrawerFixture.tsx` with
`mobile/scripts/serve-native-conversation.mjs` from `mobile/`; choose an unused
fixture port and leave the shared App.tsx/Metro entry unchanged. Use supported
Simulator UI controls when available, and restore the real app after inspection.
Native iPhone 17 Simulator rendering and browser checks are separate from
physical-device keyboard, VoiceOver and Dynamic Type acceptance.
