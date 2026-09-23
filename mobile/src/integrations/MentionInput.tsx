import { forwardRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
} from 'react-native';
import { useTheme } from '../theme';
import { mentionParts } from './mentions';
import { MentionText } from './MentionText';

/** A visual mirror preserves native editing/selection/IME instead of rewriting input spans. */
export const MentionInput = forwardRef<TextInput, TextInputProps & { known: string[] }>(
  function MentionInput({ known, style, value = '', ...props }, ref) {
    const { colors } = useTheme();
    const [scroll, setScroll] = useState(0);
    // How far the words run past the box, once the field has said; the mirror never
    // moves further than that, so a scroll offset the field reports while the
    // keyboard or the box is animating cannot carry the words out of view.
    const [box, setBox] = useState<number | null>(null);
    const [content, setContent] = useState<number | null>(null);
    // The mirror exists to colour mentions. Without one to colour, the field draws
    // its own words: a mirror that slips leaves the person typing into nothing.
    const mirrored = mentionParts(value, known).some((part) => part.id);
    const overflow = box === null || content === null ? null : Math.max(0, content - box);
    const shift = Math.max(0, overflow === null ? scroll : Math.min(scroll, overflow));
    return (
      <View style={s.wrap}>
        {mirrored && (
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={StyleSheet.absoluteFill}
          >
            <Text
              accessible={false}
              style={[style, s.mirror, { color: colors.text, transform: [{ translateY: -shift }] }]}
            >
              <MentionText text={value} known={known} />
              {value.endsWith('\n') ? ' ' : ''}
            </Text>
          </View>
        )}
        <TextInput
          {...props}
          ref={ref}
          value={value}
          selectionColor={colors.accent}
          style={[
            style,
            s.input,
            mirrored && s.hidden,
            Platform.OS === 'web' ? ({ caretColor: colors.accent } as TextStyle) : null,
          ]}
          onLayout={(event) => {
            setBox(event.nativeEvent.layout.height);
            props.onLayout?.(event);
          }}
          onContentSizeChange={(event) => {
            setContent(event.nativeEvent.contentSize.height);
            props.onContentSizeChange?.(event);
          }}
          onScroll={(event) =>
            setScroll(
              event.nativeEvent.contentOffset?.y ??
                (event.nativeEvent as unknown as { target?: { scrollTop?: number } }).target
                  ?.scrollTop ??
                0,
            )
          }
        />
      </View>
    );
  },
);
const s = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  mirror: { maxHeight: undefined },
  input: { backgroundColor: 'transparent' },
  hidden: { color: 'transparent' },
});
