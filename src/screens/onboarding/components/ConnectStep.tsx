import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";
import { styles } from "../styles";

export function ConnectStep({
  children,
  icon,
  lines,
  number,
  title
}: {
  children?: React.ReactNode;
  icon: keyof typeof Ionicons.glyphMap;
  lines?: string[];
  number: number;
  title: string;
}) {
  return (
    <View style={styles.connectStep}>
      <View style={styles.connectStepTop}>
        <View style={styles.connectStepNumber}>
          <Text style={styles.connectStepNumberText}>{number}</Text>
        </View>
        <View style={styles.connectStepIcon}>
          <Ionicons name={icon} color="#8F32FF" size={27} />
        </View>
        <Text style={styles.connectStepTitle}>{title}</Text>
      </View>
      {lines?.map((line) => <Text key={line} style={styles.connectLine}>{line}</Text>)}
      {children}
    </View>
  );
}
