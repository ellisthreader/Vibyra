import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ReasoningEffort } from "../../../types/domain";
import { useThemedColor } from "../../../context/PreferencesContext";
import { chatModelGroups, chatModelOptions } from "../data/chatModels";
import { styles } from "../styles";
import { ModelMenuRow } from "./chunk10";

const EFFORT_OPTIONS: { value: ReasoningEffort; label: string; short: string; hint: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "low", label: "Low", short: "Low", hint: "Fast • cheap", icon: "battery-half-outline" },
  { value: "medium", label: "Medium", short: "Med", hint: "Balanced", icon: "flash-outline" },
  { value: "high", label: "High", short: "High", hint: "Deeper reasoning", icon: "sparkles-outline" },
  { value: "xhigh", label: "Extra high", short: "X-Hi", hint: "Maximum reasoning", icon: "rocket-outline" },
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
  const activeIconColor = useThemedColor("#D7C4FF");
  const inactiveIconColor = useThemedColor("#8F8A9E");
  const selectedModel = chatModelOptions.find((model) => model.key === props.selected) ?? chatModelOptions[0];
  if (!props.open) return null;
  return (
    <View style={styles.chatModelMenu}>
      <View style={styles.chatModelEffortHeader}>
        <View style={styles.chatModelEffortHeaderTop}>
          <Text numberOfLines={1} style={styles.chatModelEffortTitle}>{selectedModel.label}</Text>
          <Text style={styles.chatModelEffortMeta}>Effort</Text>
        </View>
        <View style={styles.chatModelEffortChoices}>
          {EFFORT_OPTIONS.map((option) => {
            const active = props.reasoningEffort === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => props.onSelectEffort(option.value)}
                style={({ pressed }) => [
                  styles.chatModelEffortChoice,
                  active && styles.chatModelEffortChoiceActive,
                  pressed && { opacity: 0.85 }
                ]}
              >
                <Ionicons name={option.icon} color={active ? activeIconColor : inactiveIconColor} size={13} />
                <Text style={[styles.chatModelEffortChoiceText, active && styles.chatModelEffortChoiceTextActive]}>{option.short}</Text>
              </Pressable>
            );
          })}
        </View>
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

export function effortShortLabel(value: ReasoningEffort): string {
  return EFFORT_OPTIONS.find((option) => option.value === value)?.short ?? "Med";
}
