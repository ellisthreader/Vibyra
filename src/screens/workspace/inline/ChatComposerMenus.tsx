import React, { useMemo, useState } from "react";
import { LayoutChangeEvent, PanResponder, Pressable, Text, View } from "react-native";
import { ReasoningEffort } from "../../../types/domain";
import { chatModelGroups, chatModelOptionFor, chatModelOptions } from "../data/chatModels";
import { styles } from "../styles";
import { ModelMenuRow } from "./chunk10";

const EFFORT_OPTIONS: { value: ReasoningEffort; label: string; short: string; hint: string }[] = [
  { value: "low", label: "Low", short: "Low", hint: "Fast" },
  { value: "medium", label: "Medium", short: "Med", hint: "Balanced" },
  { value: "high", label: "High", short: "High", hint: "Deeper" },
  { value: "xhigh", label: "Extra high", short: "X-Hi", hint: "Maximum" },
];

export function ModelMenu(props: {
  open: boolean;
  accountPlan: string;
  selected: string;
  reasoningEffort: ReasoningEffort;
  onSelect: (model: (typeof chatModelOptions)[number]) => void;
  onSelectEffort: (effort: ReasoningEffort) => void;
  onUpgrade: () => void;
}) {
  const selectedModel = chatModelOptionFor(props.selected) ?? chatModelOptions[0];
  if (!props.open) return null;
  return (
    <View style={styles.chatModelMenu}>
      <View style={styles.chatModelEffortHeader}>
        <View style={styles.chatModelEffortHeaderTop}>
          <Text numberOfLines={1} style={styles.chatModelEffortTitle}>{selectedModel.label}</Text>
          <Text style={styles.chatModelEffortMeta}>Effort</Text>
        </View>
        <EffortSlider value={props.reasoningEffort} onChange={props.onSelectEffort} />
      </View>
      {chatModelGroups.map((group) => (
        <View key={group.title || "auto"} style={styles.chatModelGroup}>
          {group.title ? <Text style={styles.chatModelGroupTitle}>{group.title}</Text> : null}
          {group.options.map((model) => (
            <ModelMenuRow
              key={model.key}
              accountPlan={props.accountPlan}
              model={model}
              onSelect={props.onSelect}
              onUpgrade={props.onUpgrade}
              selected={props.selected === model.key}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function EffortSlider({ onChange, value }: { onChange: (effort: ReasoningEffort) => void; value: ReasoningEffort }) {
  const [width, setWidth] = useState(0);
  const activeIndex = Math.max(0, EFFORT_OPTIONS.findIndex((option) => option.value === value));
  const progress = EFFORT_OPTIONS.length > 1 ? activeIndex / (EFFORT_OPTIONS.length - 1) : 0;

  const selectFromX = (x: number) => {
    if (!width) return;
    const clamped = Math.max(0, Math.min(width, x));
    const index = Math.round((clamped / width) * (EFFORT_OPTIONS.length - 1));
    onChange(EFFORT_OPTIONS[index].value);
  };
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: () => true,
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => selectFromX(event.nativeEvent.locationX),
    onPanResponderMove: (event) => selectFromX(event.nativeEvent.locationX)
  }), [width, onChange]);

  return (
    <View style={styles.chatModelEffortSlider}>
      <View
        {...panResponder.panHandlers}
        onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
        style={styles.chatModelEffortTrack}
      >
        <View style={[styles.chatModelEffortTrackFill, { width: `${progress * 100}%` }]} />
        <View style={[styles.chatModelEffortThumb, { left: `${progress * 100}%` }]} />
        <View style={styles.chatModelEffortStops}>
          {EFFORT_OPTIONS.map((option, index) => {
            const active = index <= activeIndex;
            const stopPosition = `${(index / (EFFORT_OPTIONS.length - 1)) * 100}%`;
            return (
              <Pressable
                key={option.value}
                onPress={() => onChange(option.value)}
                style={[styles.chatModelEffortStopHit, { left: stopPosition }]}
              >
                <View style={[styles.chatModelEffortStop, active && styles.chatModelEffortStopActive]} />
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={styles.chatModelEffortLabels}>
        {EFFORT_OPTIONS.map((option) => (
          <Pressable key={option.value} onPress={() => onChange(option.value)} style={styles.chatModelEffortLabelHit}>
            <Text style={[styles.chatModelEffortChoiceText, value === option.value && styles.chatModelEffortChoiceTextActive]}>{option.short}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function effortShortLabel(value: ReasoningEffort): string {
  return EFFORT_OPTIONS.find((option) => option.value === value)?.short ?? "Med";
}
