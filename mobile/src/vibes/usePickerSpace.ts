import { useEffect, useState } from 'react';
import { Keyboard, Platform, useWindowDimensions } from 'react-native';

/** Search can summon the keyboard inside the composer; retain visible chat above. */
export function usePickerSpace(minimum = 160) {
  const { height, fontScale } = useWindowDimensions();
  const [keyboard, setKeyboard] = useState(() =>
    Platform.OS === 'web' ? 0 : (Keyboard.metrics()?.height ?? 0),
  );
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const show = Keyboard.addListener('keyboardDidShow', (event) =>
      setKeyboard(event.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  // Keep a full result row between search and paging when the keyboard opens.
  return { maximum: Math.max(minimum, Math.min(344, (height - keyboard) * 0.55)), fontScale };
}
