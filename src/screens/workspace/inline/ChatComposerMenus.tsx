import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ReasoningEffort } from "../../../types/domain";
import { chatModelGroups, chatModelOptions } from "../data/chatModels";
import { styles } from "../styles";
import { ModelMenuRow } from "./chunk10";

const EFFORT_OPTIONS: { value: ReasoningEffort; label: string; short: string; hint: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "low", label: "Low", short: "Low", hint: "Fast • cheap", icon: "battery-half-outline" },
  { value: "medium", label: "Medium", short: "Med", hint: "Balanced", icon: "flash-outline" },
  { value: "high", label: "High", short: "High", hint: "Deeper reasoning", icon: "sparkles-outline" },
  { value: "xhigh", label: "Extra high", short: "X-Hi", hint: "Maximum reasoning", icon: "rocket-outline" },
];

export function ModelMenu(props: { open: boolean; accountPlan: string; selected: string; onSelect: (model: (typeof chatModelOptions)[number]) => void; onUpgrade: () => void }) {
  if (!props.open) return null;
  return (
    <View style={styles.chatModelMenu}>
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

export function EffortMenu(props: { open: boolean; selected: ReasoningEffort; onSelect: (effort: ReasoningEffort) => void }) {
  if (!props.open) return null;
  return (
    <View style={styles.chatEffortMenu}>
      {EFFORT_OPTIONS.map((option) => {
        const active = props.selected === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => props.onSelect(option.value)}
            style={({ pressed }) => [
              styles.chatEffortMenuRow,
              active && styles.chatEffortMenuRowActive,
              pressed && { opacity: 0.85 }
            ]}
          >
            <Ionicons name={option.icon} color={active ? "#D7C4FF" : "#8F8A9E"} size={16} />
            <Text style={[styles.chatEffortMenuLabel, active && styles.chatEffortMenuLabelActive]}>{option.label}</Text>
            <Text style={styles.chatEffortMenuHint}>{option.hint}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function effortShortLabel(value: ReasoningEffort): string {
  return EFFORT_OPTIONS.find((option) => option.value === value)?.short ?? "Med";
}
