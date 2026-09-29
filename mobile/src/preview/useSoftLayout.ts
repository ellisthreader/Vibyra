import { useRef } from 'react';
import { LayoutAnimation } from 'react-native';
import { useReducedMotion } from '../ui/useReducedMotion';

const SOFT = LayoutAnimation.create(240, 'easeInEaseOut', 'opacity');

/** When `key` changes the next layout eases (a card growing as its app starts)
 *  instead of jumping. Called while rendering because it only arms the next layout. */
export function useSoftLayout(key: string) {
  const reduced = useReducedMotion();
  const last = useRef(key);
  if (last.current !== key) {
    last.current = key;
    if (!reduced) LayoutAnimation.configureNext(SOFT);
  }
}
