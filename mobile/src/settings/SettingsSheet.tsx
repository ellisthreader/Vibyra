import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useTheme } from '../theme';
import type { AccountMode } from '../onboarding/AccountForm';
import { AccountSheet } from '../ui/AccountSheet';
import { OverlaySheet } from '../ui/OverlaySheet';
import type { WorkspaceModel } from '../ui/types';
import { useReducedMotion } from '../ui/useReducedMotion';
import { settingsPages, type SettingsNav, type SettingsPageId, type SettingsRoutes } from './pages';
import { SettingsHome } from './SettingsHome';

type Layer = 'home' | SettingsPageId;

/**
 * Settings: one sheet, a home list, and pages pushed over it. Every page in the
 * stack stays mounted, so going back finds the list where it was left; only the top
 * page is reachable. A page slides in from the right while the one beneath shifts a
 * third of the way left and dims, and Back runs the same move in reverse. With Reduce
 * Motion the two simply cross-fade. Closing returns the stack to the list.
 */
export function SettingsSheet({
  visible,
  workspace,
  onClose,
  routes,
  initialPage,
}: {
  visible: boolean;
  workspace: WorkspaceModel;
  onClose: () => void;
  routes: SettingsRoutes;
  /** Open straight to a page, over the list so Back still leads home. Unregistered pages open the list. */
  initialPage?: SettingsPageId | null;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const screen = useWindowDimensions();
  const [width, setWidth] = useState(Math.min(screen.width, 560));
  // Mounted already open (the wallet's Back remounts it), it starts on the page rather
  // than painting the list for a frame before the effect below moves it there.
  const [stack, setStack] = useState<Layer[]>(() =>
    visible && initialPage && settingsPages[initialPage] ? ['home', initialPage] : ['home'],
  );
  // The page on its way out while Back runs; it is dropped once it has left.
  const [leaving, setLeaving] = useState<Layer | null>(null);
  const [pushing, setPushing] = useState(true);
  // The one account form the sheet raises, for the header, the Account rows and any page.
  const [accountForm, setAccountForm] = useState<AccountMode | null>(null);
  const motion = useRef(new Animated.Value(1)).current;
  const current = useRef(stack);
  current.current = stack;
  const latest = useRef({ onClose, reduced });
  latest.current = { onClose, reduced };
  const nav = useMemo<SettingsNav>(() => {
    const run = (to: number, done?: () => void) =>
      Animated.timing(motion, {
        toValue: to,
        duration: latest.current.reduced ? 150 : 260,
        useNativeDriver: Platform.OS !== 'web',
        easing: latest.current.reduced ? Easing.inOut(Easing.quad) : Easing.out(Easing.cubic),
      }).start(({ finished }) => {
        if (finished) done?.();
      });
    return {
      push: (page) => {
        if (!settingsPages[page] || current.current.includes(page)) return;
        setPushing(true);
        setLeaving(null);
        motion.setValue(0);
        setStack([...current.current, page]);
        run(1);
      },
      back: () => {
        const stackNow = current.current;
        if (stackNow.length < 2) return;
        setPushing(false);
        setLeaving(stackNow[stackNow.length - 1]!);
        motion.setValue(1);
        setStack(stackNow.slice(0, -1));
        run(0, () => setLeaving(null));
      },
      close: (then) => {
        latest.current.onClose();
        then?.();
      },
      signIn: (mode) => setAccountForm(mode ?? 'login'),
    };
  }, [motion]);
  // Arriving at a page is not a push: the sheet itself is what moves, so the page is
  // simply already there with the list underneath it.
  useEffect(() => {
    if (!visible || !initialPage || !settingsPages[initialPage]) return;
    if (current.current[current.current.length - 1] === initialPage) return;
    motion.stopAnimation();
    motion.setValue(1);
    setLeaving(null);
    setPushing(true);
    setStack(['home', initialPage]);
  }, [visible, initialPage, motion]);
  const top = stack[stack.length - 1]!;
  // The page that moves, and the one it moves over: the new page on the way in, the
  // leaving page on the way back. Both read the same 0 → 1 of `motion`.
  const moving = pushing ? top : leaving;
  const under = pushing ? stack[stack.length - 2] : top;
  const layers = leaving ? [...stack, leaving] : stack;
  const title = top === 'home' ? 'Settings' : (settingsPages[top]?.title ?? 'Settings');
  const reset = () => {
    motion.stopAnimation();
    motion.setValue(1);
    setLeaving(null);
    setPushing(true);
    setStack(['home']);
  };
  return (
    <OverlaySheet
      visible={visible}
      title={title}
      label="Settings"
      testID="settings-sheet"
      onClose={onClose}
      onBack={stack.length > 1 ? nav.back : undefined}
      onClosed={reset}
    >
      <View style={s.stage} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {layers.map((id) => {
          const isMoving = id === moving;
          const isUnder = id === under && !isMoving;
          const active = id === top;
          const shown = isMoving || isUnder || active;
          const style = !shown
            ? { opacity: 0 }
            : isMoving
              ? reduced
                ? { opacity: motion }
                : {
                    transform: [
                      {
                        translateX: motion.interpolate({
                          inputRange: [0, 1],
                          outputRange: [width, 0],
                        }),
                      },
                    ],
                  }
              : isUnder
                ? reduced
                  ? { opacity: motion.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }
                  : {
                      opacity: motion.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] }),
                      transform: [
                        {
                          translateX: motion.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, -width * 0.3],
                          }),
                        },
                      ],
                    }
                : null;
          const Page = id === 'home' ? null : settingsPages[id]?.Page;
          return (
            <Animated.View
              key={id}
              pointerEvents={active ? 'auto' : 'none'}
              aria-hidden={!active}
              accessibilityElementsHidden={!active}
              importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
              style={[StyleSheet.absoluteFill, { backgroundColor: colors.rail }, style]}
            >
              {id === 'home' ? (
                <SettingsHome workspace={workspace} nav={nav} routes={routes} />
              ) : Page ? (
                <Page workspace={workspace} nav={nav} routes={routes} />
              ) : null}
            </Animated.View>
          );
        })}
      </View>
      <AccountSheet
        visible={accountForm !== null}
        mode={accountForm ?? 'login'}
        workspace={workspace}
        onClose={() => setAccountForm(null)}
      />
    </OverlaySheet>
  );
}
const s = StyleSheet.create({
  // Pages slide within the sheet, never over its rounded edge.
  stage: { flex: 1, overflow: 'hidden' },
});
