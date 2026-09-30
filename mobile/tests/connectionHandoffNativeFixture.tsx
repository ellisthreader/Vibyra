import { useRef, useState } from 'react';
import { registerRootComponent } from 'expo';
import { Animated, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConnectionModal } from '../src/connection/ConnectionModal';
import { ComputerHandoff, type HandoffOrigin } from '../src/connection/ComputerHandoff';
import { ConnectingStep } from '../src/connection/ConnectingStep';
import { FoundComputer } from '../src/connection/FoundComputer';
import { Button } from '../src/ui/primitives';
import { palettes, ThemeContext } from '../src/theme';
import { fixtureWorkspace } from './conversationWorkspaceFixture';

const computer = { id: 'fixture', name: 'Ellis’s MacBook', platform: 'macos', hostId: 'ab'.repeat(32), host: '127.0.0.1', port: 4318 };
// Native recording of the shared art/geometry; no discovery, network or real approvals.
function Fixture() {
  const [dark, setDark] = useState(true);
  const [open, setOpen] = useState(true);
  const [picked, setPicked] = useState(false);
  const [origin, setOrigin] = useState<HandoffOrigin>();
  const frame = useRef<View>(null);
  const machine = useRef<View>(null);
  const departure = useRef(new Animated.Value(1)).current;
  const compact = useWindowDimensions().height < 780;
  const colors = palettes[dark ? 'dark' : 'light'];
  const workspace = { ...fixtureWorkspace, host: null, status: 'pairing' as const,
    actions: { ...fixtureWorkspace.actions, connect: () => new Promise<void>(() => {}), disconnect: () => {} } };
  const replay = () => { departure.setValue(1); setPicked(false); setOrigin(undefined); setOpen(true); };
  const choose = () => machine.current?.measureInWindow((x, y, width, height) => {
    frame.current?.measureInWindow((cx, cy) => {
      Animated.timing(departure, { toValue: 0, duration: 140, useNativeDriver: true }).start(() => {
        setOrigin({ machine: { x, y, width, height }, container: { x: cx, y: cy } }); setPicked(true);
      });
    });
  });
  return <SafeAreaProvider><ThemeContext.Provider value={{ colors, dark }}>
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: 24 }}>
      <Pressable accessibilityRole="button" onPress={() => setDark(value => !value)}><Text style={{ color: colors.text }}>Toggle theme</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={replay}><Text style={{ color: colors.text }}>Replay handoff</Text></Pressable>
      {open && <ConnectionModal onClose={() => setOpen(false)}>{dismiss =>
        <View ref={frame} collapsable={false} style={{ flex: 1 }}>
          {picked ? <ComputerHandoff computer={computer} origin={origin}>
            <ConnectingStep workspace={workspace} computer={computer} onDone={dismiss} onSearch={dismiss} />
          </ComputerHandoff> : <View style={{ flex: 1, paddingHorizontal: 26, paddingTop: 8, gap: 20 }}>
            <Animated.View style={{ opacity: departure, gap: 10 }}>
              <Text style={{ color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: '600' }}>Is this your computer?</Text>
              <Text style={{ color: colors.muted, fontSize: 15, lineHeight: 22 }}>Connect to it to get started.</Text>
            </Animated.View>
            <FoundComputer computer={computer} compact={compact} stageRef={machine} labelOpacity={departure} />
            <Animated.View style={{ opacity: departure, marginTop: 'auto', paddingBottom: 20 }}>
              <Button title="Yes, connect" onPress={choose} />
            </Animated.View>
          </View>}
        </View>
      }</ConnectionModal>}
    </View>
  </ThemeContext.Provider></SafeAreaProvider>;
}
registerRootComponent(Fixture);
