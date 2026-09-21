import { View, type ViewProps } from 'react-native';
import { useGlass } from './glass';

/** Opaque, readable material on web, Android and older native builds. */
export function ComposerSurface({ style, matte = false, ...props }: ViewProps & { matte?: boolean }) {
  const glass = useGlass();
  return <View {...props} style={[!matte && glass.sheet, style]} />;
}
