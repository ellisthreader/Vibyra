import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { arrived, thud } from '../ui/haptics';

// The lid starts to swing a beat after the machine has arrived, and first
// meets its stop about 430ms later: a spring this soft and this damped crosses
// its target there, overshoots by three degrees and settles, the way a real
// lid does. Slow enough to be watched, quick enough not to be waited for.
const LID_START = 320;
const LID_HITS = LID_START + 430;

export interface Arrival {
  rise: Animated.Value;
  lid: Animated.Value;
  settle: Animated.Value;
}

/** The found computer arriving. Three native-driven values, one choreography:
 *  `rise` brings the machine up from the ring, `lid` opens it (0 closed → 1
 *  open, with a wobble past 1 as it hits the stop), and `settle` brings the words
 *  up after it. The phone taps as the computer is found and thuds as the lid lands.
 *  With Reduce Motion the picture is drawn finished and only the tap is felt. */
export function useArrival(still: boolean): Arrival {
  const rise = useRef(new Animated.Value(still ? 1 : 0)).current;
  const lid = useRef(new Animated.Value(still ? 1 : 0)).current;
  const settle = useRef(new Animated.Value(still ? 1 : 0)).current;
  // One object for the life of the arrival: the art it drives is memoised on it,
  // and a search that keeps reporting must not rebuild the drivers mid-flight.
  const arrival = useRef<Arrival>({ rise, lid, settle }).current;
  const cued = useRef(false);
  useEffect(() => {
    if (!cued.current) {
      cued.current = true;
      arrived();
    }
    if (still) {
      [rise, lid, settle].forEach((value) => value.setValue(1));
      return;
    }
    [rise, lid, settle].forEach((value) => value.setValue(0));
    const native = { useNativeDriver: true, isInteraction: false };
    const sequence = Animated.parallel([
      Animated.timing(rise, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        ...native,
      }),
      Animated.sequence([
        Animated.delay(LID_START),
        Animated.spring(lid, { toValue: 1, damping: 11, stiffness: 60, mass: 1, ...native }),
      ]),
      Animated.sequence([
        Animated.delay(LID_HITS - 80),
        Animated.timing(settle, {
          toValue: 1,
          duration: 560,
          easing: Easing.out(Easing.cubic),
          ...native,
        }),
      ]),
    ]);
    sequence.start();
    const knock = setTimeout(thud, LID_HITS);
    return () => {
      sequence.stop();
      clearTimeout(knock);
    };
  }, [lid, rise, settle, still]);
  return arrival;
}
