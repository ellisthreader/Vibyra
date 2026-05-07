import React from "react";
import { Image, Pressable, Text, View } from "react-native";
import { identityOptions } from "../data/options";
import { BuilderIdentity } from "../types";
import { styles } from "../styles";

export function IdentityQuestion(props: {
  selected: BuilderIdentity | null;
  onSelect: (value: BuilderIdentity) => void;
}) {
  return (
    <View style={styles.frequencyQuestion}>
      <View style={styles.frequencyHeader}>
        <Text style={styles.frequencyTitle}>What best describes you?</Text>
        <Text style={styles.frequencyHelper}>Optional. Tap one or skip.</Text>
      </View>

      <View style={styles.frequencyOptionGrid}>
        {identityOptions.map((option) => {
          const selected = props.selected === option.value;
          return (
            <View key={option.value} style={styles.frequencyOptionMotion}>
              <Pressable
                style={({ pressed }) => [
                  styles.frequencyOption,
                  selected ? styles.frequencyOptionSelected : null,
                  pressed ? styles.frequencyOptionPressed : null
                ]}
                onPress={() => props.onSelect(option.value)}
              >
                {selected ? <View pointerEvents="none" style={styles.frequencySelectedGlow} /> : null}
                <Image resizeMode="contain" source={option.icon} style={styles.frequencyOptionIcon} />
                <Text style={styles.frequencyOptionTitle}>{option.label}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}
