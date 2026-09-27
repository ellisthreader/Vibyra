import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Pressable, StatusBar, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BACKGROUND = '#0E0F12';
const MIN_MOTION_MS = 850;
const MAX_WAIT_MS = 1400;

function LaunchVideo() {
  const [firstFrameReady, setFirstFrameReady] = useState(false);
  const started = useRef(false);
  const player = useVideoPlayer(require('../../assets/launch-intro.mp4'), (ready) => {
    ready.muted = true;
    ready.loop = false;
    ready.play();
  });
  return <View pointerEvents="none" style={s.videoLayer}>
    <VideoView player={player} style={[s.video, { opacity: firstFrameReady ? 1 : 0 }]}
      onFirstFrameRender={() => {
        if (started.current) return;
        started.current = true;
        setFirstFrameReady(true);
        player.replay();
      }} contentFit="cover"
      nativeControls={false} allowsPictureInPicture={false} allowsVideoFrameAnalysis={false} />
  </View>;
}

export function LaunchIntro({ ready, onFinish }: { ready: boolean; onFinish: () => void }) {
  const [reduced, setReduced] = useState<boolean | null>(null);
  const { width } = useWindowDimensions();
  const started = useRef(Date.now());
  const leaving = useRef(false);
  const opacity = useRef(new Animated.Value(1)).current;
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => { if (active) setReduced(value); })
      .catch(() => { if (active) setReduced(true); });
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { active = false; listener.remove(); };
  }, []);

  const finish = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    Animated.timing(opacity, {
      toValue: 0,
      duration: reduced === true ? 0 : 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setPlaying(false);
      onFinish();
    });
  }, [onFinish, opacity, reduced]);

  useEffect(() => {
    if (!ready || reduced === null) return;
    const remaining = reduced ? 0 : Math.max(0, MIN_MOTION_MS - (Date.now() - started.current));
    const timer = setTimeout(finish, remaining);
    return () => clearTimeout(timer);
  }, [ready, reduced, finish]);

  useEffect(() => {
    const timer = setTimeout(finish, MAX_WAIT_MS);
    return () => clearTimeout(timer);
  }, [finish]);

  if (!playing) return null;
  return <Animated.View style={[s.cover, { opacity }]} accessibilityLabel="Starting Vibyra"
    accessibilityLiveRegion="polite" importantForAccessibility="yes">
    <StatusBar barStyle="light-content" backgroundColor={BACKGROUND} />
    <View style={s.canvas}>
      <Image source={require('../../assets/vibyra-cobalt.png')}
        style={{ width: width * 0.94, height: width * 0.94 }} resizeMode="contain" />
      {reduced === false && <LaunchVideo />}
    </View>
  </Animated.View>;
}

export function LaunchPreview({ onClose }: { onClose: () => void }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [take, setTake] = useState(0);
  return <View style={s.preview} accessibilityViewIsModal>
    <StatusBar barStyle="light-content" backgroundColor={BACKGROUND} />
    <Image source={require('../../assets/vibyra-cobalt.png')}
      style={{ width: width * 0.94, height: width * 0.94 }} resizeMode="contain" />
    <LaunchVideo key={take} />
    <Pressable accessibilityRole="button" accessibilityLabel="Done previewing launch video"
      onPress={onClose} style={[s.done, { top: insets.top + 16 }]}>
      <Text style={s.buttonText}>Done</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Replay launch video"
      onPress={() => setTake(value => value + 1)} style={[s.replay, { bottom: insets.bottom + 28 }]}>
      <Text style={s.buttonText}>Replay video</Text>
    </Pressable>
  </View>;
}

const s = StyleSheet.create({
  cover: { ...StyleSheet.absoluteFill, zIndex: 100, backgroundColor: BACKGROUND },
  canvas: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BACKGROUND },
  videoLayer: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  video: { width: '100%', aspectRatio: 9 / 16 },
  preview: { ...StyleSheet.absoluteFill, zIndex: 101, alignItems: 'center', justifyContent: 'center', backgroundColor: BACKGROUND },
  done: { position: 'absolute', right: 20, paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 20, backgroundColor: '#282B33' },
  replay: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 24, backgroundColor: '#282B33' },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
