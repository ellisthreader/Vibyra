import React, { useMemo, useRef, useState } from "react";
import { Image, LayoutChangeEvent, PanResponder, Pressable, Text, View } from "react-native";
import { depthOptions } from "../data/options";
import { UsageDepth } from "../types";
import { styles } from "../styles";

export function UsageSlider(props: {
  title: string;
  selected: UsageDepth;
  onSelect: (value: UsageDepth) => void;
}) {
  const trackRef = useRef<View>(null);
  const [trackWidth, setTrackWidth] = useState(1);
  const [trackX, setTrackX] = useState(0);
  const selectedIndex = Math.max(0, depthOptions.findIndex((option) => option.value === props.selected));

  const updateFromPageX = (pageX: number) => {
    const clamped = Math.max(0, Math.min(trackWidth, pageX - trackX));
    const index = Math.round((clamped / trackWidth) * (depthOptions.length - 1));
    props.onSelect(depthOptions[index].value);
  };

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: () => true,
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => updateFromPageX(event.nativeEvent.pageX),
    onPanResponderMove: (event) => updateFromPageX(event.nativeEvent.pageX)
  }), [trackWidth, trackX, props]);

  const onTrackLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(Math.max(1, event.nativeEvent.layout.width));
    requestAnimationFrame(() => {
      trackRef.current?.measureInWindow((x) => setTrackX(x));
    });
  };

  return (
    <View style={styles.frequencyQuestion}>
      <View style={styles.frequencyHeader}>
        <Text style={styles.frequencyTitle}>{props.title}</Text>
      </View>

      <View style={styles.sliderOptions}>
        {depthOptions.map((option) => {
          const active = props.selected === option.value;
          return (
            <Pressable
              key={option.value}
              style={({ pressed }) => [
                styles.sliderOption,
                active ? styles.sliderOptionActive : null,
                pressed ? styles.sliderOptionPressed : null
              ]}
              onPress={() => props.onSelect(option.value)}
            >
              <Image resizeMode="contain" source={option.icon} style={[styles.sliderIcon, active ? styles.sliderIconActive : null]} />
              <Text style={[styles.sliderOptionText, active ? styles.sliderOptionTextActive : null]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View ref={trackRef} style={styles.sliderTrackWrap} onLayout={onTrackLayout} {...panResponder.panHandlers}>
        <View style={styles.sliderTrack} />
        <View style={[styles.sliderFill, { width: `${(selectedIndex / (depthOptions.length - 1)) * 100}%` }]} />
        {depthOptions.map((option, index) => {
          const active = index <= selectedIndex;
          return (
            <Pressable
              key={option.value}
              style={[styles.sliderStop, { left: `${(index / (depthOptions.length - 1)) * 100}%` }]}
              onPress={() => props.onSelect(option.value)}
            >
              <View style={[styles.sliderDot, active ? styles.sliderDotActive : null]} />
            </Pressable>
          );
        })}
        <View style={[styles.sliderThumb, { left: `${(selectedIndex / (depthOptions.length - 1)) * 100}%` }]} />
      </View>
    </View>
  );
}
