import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../styles/theme";

export function SectionHeader({ title, action }: { title: string; action?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? <Text style={styles.sectionAction}>{action}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionAction: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "800"
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    marginTop: 4
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800"
  }
});
