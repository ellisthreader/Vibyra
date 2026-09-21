import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// The last answer the system gave. It resolves asynchronously and reads as "reduce"
// until it does, so without this every remount starts still and animates nothing —
// the Vibes page in Settings, handed a purchase from the upgrade page, would open at
// the new balance instead of counting up to it.
let known: boolean | undefined;

export function useReducedMotion() {
  const [reduced, setReduced] = useState(known ?? true);
  useEffect(() => {
    let active = true;
    const set = (value: boolean) => { known = value; if (active) setReduced(value); };
    void AccessibilityInfo.isReduceMotionEnabled().then(set);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', set);
    return () => { active = false; subscription.remove(); };
  }, []);
  return reduced;
}
