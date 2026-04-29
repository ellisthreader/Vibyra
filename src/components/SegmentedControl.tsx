import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../styles/theme";

type Props<T extends string> = {
  selected: T;
  values: T[];
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({ selected, values, onChange }: Props<T>) {
  return (
    <View style={styles.segmented}>
      {values.map((value) => {
        const active = value === selected;
        return (
          <Pressable
            key={value}
            onPress={() => onChange(value)}
            style={[styles.segment, active ? styles.segmentActive : null]}
          >
            <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>
              {value}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segment: {
    alignItems: "center",
    borderRadius: 7,
    flex: 1,
    height: 38,
    justifyContent: "center"
  },
  segmentActive: {
    backgroundColor: colors.elevated
  },
  segmented: {
    backgroundColor: "#070707",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    padding: 4
  },
  segmentText: {
    color: colors.dim,
    fontSize: 12,
    fontWeight: "800"
  },
  segmentTextActive: {
    color: colors.text
  }
});
