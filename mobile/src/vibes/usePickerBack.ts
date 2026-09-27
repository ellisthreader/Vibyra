import { useEffect } from 'react';
import { BackHandler } from 'react-native';

export function usePickerBack(back: () => void) {
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      back();
      return true;
    });
    return () => subscription.remove();
  }, [back]);
}
