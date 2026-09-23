import { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/** A render failure should leave a way back into the app without showing private data. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={styles.root} accessibilityRole="alert">
        <Text style={styles.title}>Vibyra could not show this screen.</Text>
        <Text style={styles.detail}>
          Try reopening your workspace. Your saved work stays on this phone and computer.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reopen Vibyra"
          onPress={() => this.setState({ failed: false })}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Reopen Vibyra</Text>
        </Pressable>
      </View>
    );
  }
}
const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 28,
    backgroundColor: '#171a20',
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '600', textAlign: 'center' },
  detail: { color: '#b8becb', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  button: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: '#527bff',
  },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
