import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Image, ImageSourcePropType, Pressable, Text, View } from "react-native";
import { styles } from "../styles";

export function QuestionScreen<T extends string>(props: {
  title: string;
  helper?: string;
  options: Array<{ label: string; value: T; icon: ImageSourcePropType }>;
  selected: T | T[] | null;
  onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.frequencyQuestion}>
      <View style={styles.frequencyHeader}>
        <Text style={styles.frequencyTitle}>{props.title}</Text>
        {props.helper ? <Text style={styles.frequencyHelper}>{props.helper}</Text> : null}
      </View>

      <View style={styles.frequencyOptionGrid}>
        {props.options.map((option) => {
          const selected = Array.isArray(props.selected)
            ? props.selected.includes(option.value)
            : props.selected === option.value;
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
                {selected ? <View style={[styles.frequencySelectedGlow, { pointerEvents: "none" }]} /> : null}
                {selected ? (
                  <View style={styles.frequencyOptionCheck}>
                    <Ionicons name="checkmark" color="#071016" size={15} />
                  </View>
                ) : null}
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
