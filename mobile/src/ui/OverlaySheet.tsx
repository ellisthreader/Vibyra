import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, BackHandler, Easing, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text,
  useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { Icon } from './primitives';
import { useReducedMotion } from './useReducedMotion';
import { useSheetDrag } from './useSheetDrag';

const BottomInset = createContext(0);
/** The home-indicator inset. The sheet runs to the screen's edge, so a page pads its
 *  own scroll with this `+ 24` and its last row clears the indicator. */
export const useSheetBottomInset = () => useContext(BottomInset);

/**
 * A tall sheet that rises over whatever is on screen and stops short of the top, so
 * the place it was opened from stays in view, dimmed — Settings lives in one. It is
 * drawn in the parent's own tree rather than in a `Modal` (`Sheet` is the Modal one):
 * presenting a Modal while the drawer's Modal is still
 * dismissing does nothing on iOS — the WalletSheet lost its tap to exactly that — and
 * a layer has no presentation to race. Modals opened from inside it stack above it.
 *
 * Keep it rendered and toggle `visible`; the parent draws it last and hides its own
 * screen from assistive tech while it is open. `label` names the dialog when `title`
 * is a page inside it, so the sheet stays "Settings" while its header says "Memory".
 */
export function OverlaySheet({ visible, title, label = title, onClose, onBack, onClosed, children, testID = 'overlay-sheet' }: {
  visible: boolean; title: string; label?: string; onClose: () => void; onBack?: () => void; onClosed?: () => void;
  children: ReactNode; testID?: string;
}) {
  const { colors, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const native = Platform.OS !== 'web';
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const shown = useRef(visible);
  const closed = useRef(onClosed); closed.current = onClosed;
  const dismiss = useRef(onBack ?? onClose); dismiss.current = onBack ?? onClose;
  const titleRef = useRef<Text>(null);
  const closeRef = useRef<View>(null);
  const panelRef = useRef<View>(null);
  const wide = width >= 700;
  const short = height < 500;
  const top = insets.top + (short ? 8 : 44);
  // The 86% cap is for tablets and browsers; a phone on its side keeps every point.
  const sheetHeight = Math.max(0, wide && !short ? Math.min(height * 0.86, height - top) : height - top);
  const panelWidth = wide ? 560 : width;
  const { drag, panHandlers } = useSheetDrag({ height: sheetHeight, onDismiss: onClose, native });
  useEffect(() => {
    if (visible) { setMounted(true); shown.current = true; drag.setValue(0); }
    const motion = visible && !reduced
      ? Animated.spring(progress, { toValue: 1, damping: 22, stiffness: 240, mass: 1, useNativeDriver: native })
      : Animated.timing(progress, { toValue: visible ? 1 : 0, duration: reduced ? 150 : 200,
        easing: reduced ? Easing.inOut(Easing.quad) : Easing.in(Easing.cubic), useNativeDriver: native });
    motion.start(({ finished }) => {
      if (!finished || visible || !shown.current) return;
      shown.current = false; setMounted(false); closed.current?.();
    });
    return () => motion.stop();
  }, [visible, reduced, progress, drag, native]);
  // Arriving focus: VoiceOver lands on the page's title (again after each page change);
  // the browser moves keyboard focus into the dialog, onto its close button.
  useEffect(() => {
    if (!visible || !mounted) return;
    const timer = setTimeout(() => {
      if (!native) (closeRef.current as unknown as { focus?: () => void } | null)?.focus?.();
      else if (titleRef.current) AccessibilityInfo.sendAccessibilityEvent(titleRef.current, 'focus');
    }, 80);
    return () => clearTimeout(timer);
  }, [visible, mounted, title, native]);
  // Android back and the browser's Escape step back a page first, then close.
  useEffect(() => {
    if (!visible) return;
    // react-native-web logs an error for BackHandler, so each platform gets only its own.
    const hardware = native ? BackHandler.addEventListener('hardwareBackPress', () => { dismiss.current(); return true; }) : null;
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // A Modal raised from inside the sheet (the sign-in form) closes on its own Escape,
      // on keyup; this runs first, on keydown, so only the topmost dialog may answer it.
      const dialogs = document.querySelectorAll('[aria-modal="true"]');
      if (dialogs.length && dialogs[dialogs.length - 1] !== (panelRef.current as unknown)) return;
      event.preventDefault(); dismiss.current();
    };
    const web = !native && typeof document !== 'undefined';
    if (web) document.addEventListener('keydown', key);
    return () => { hardware?.remove(); if (web) document.removeEventListener('keydown', key); };
  }, [visible, native]);
  if (!mounted) return null;
  const slide = reduced ? drag : Animated.add(progress.interpolate({ inputRange: [0, 1], outputRange: [sheetHeight + 40, 0] }), drag);
  return <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: progress }]} />
    {/* The dimmed app closes the sheet on a tap. It is not announced: × and Escape are the accessible ways out. */}
    <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} focusable={false}
      importantForAccessibility="no" aria-hidden />
    <Animated.View ref={panelRef} testID={testID} accessibilityViewIsModal role={native ? undefined : 'dialog'} aria-modal aria-label={label}
      style={[s.panel, { height: sheetHeight, width: panelWidth, left: (width - panelWidth) / 2,
        backgroundColor: colors.rail, shadowOpacity: dark ? 0.4 : 0.14,
        opacity: reduced ? progress : 1, transform: [{ translateY: slide }] }]}>
      <View {...panHandlers} style={s.handleZone}>
        <View style={[s.grabber, { backgroundColor: colors.muted }]} />
        <View style={s.header}>
          {/* Each button is only as big as what it draws, with the rest of its 44pt reach
              given as hitSlop, so a keyboard focus ring hugs the circle instead of boxing it. */}
          <View style={s.side}>{onBack && <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack}
            hitSlop={6} style={({ pressed }) => [s.back, { opacity: pressed ? 0.55 : 1 }]}>
            <Icon name="chevron-back" size={24} color={colors.text} /></Pressable>}</View>
          <Text ref={titleRef} accessibilityRole="header" numberOfLines={1} selectable={false}
            style={[s.title, { color: colors.text }]}>{title}</Text>
          <View style={[s.side, s.end]}>
            <Pressable ref={closeRef} accessibilityRole="button" accessibilityLabel={`Close ${label}`} onPress={onClose}
              hitSlop={{ top: 7, bottom: 7, left: 14, right: 7 }}
              style={({ pressed }) => [s.close, { backgroundColor: colors.elevated, opacity: pressed ? 0.55 : 1 }]}>
              <Icon name="close" size={18} color={colors.muted} />
            </Pressable>
          </View>
        </View>
      </View>
      {/* The avoiding view measures itself against the panel, not the screen, so it is
          told where the panel starts or it would lift a page short by that much. */}
      <KeyboardAvoidingView style={s.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={height - sheetHeight}>
        <BottomInset.Provider value={insets.bottom}>{children}</BottomInset.Provider>
      </KeyboardAvoidingView>
    </Animated.View>
  </View>;
}
const s = StyleSheet.create({
  // No `overflow: hidden`: on iOS it would clip the shadow that lifts the sheet off the app.
  panel: { position: 'absolute', bottom: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    shadowColor: '#000', shadowRadius: 24, shadowOffset: { width: 0, height: -8 }, elevation: 24 },
  // Unselectable: in a browser a drag that starts on the title would otherwise begin a
  // text selection, and the responder system gives the gesture up to it.
  handleZone: { paddingTop: 14, userSelect: 'none' },
  grabber: { position: 'absolute', top: 8, alignSelf: 'center', width: 36, height: 5, borderRadius: 3, opacity: 0.35 },
  header: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  side: { width: 44, minHeight: 44, justifyContent: 'center' },
  end: { alignItems: 'flex-end' },
  back: { width: 32, height: 32, borderRadius: 16, marginLeft: -4, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', letterSpacing: -0.3 },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minHeight: 0 },
});
