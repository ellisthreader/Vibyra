import React from "react";
import { Text, View } from "react-native";
import { styles } from "../styles";

export function PairCode({ code }: { code: string }) {
  return (
    <View style={styles.pairCodeRow}>
      {(code || "------").padEnd(6, "-").slice(0, 6).split("").map((char, index) => (
        <View key={`${char}-${index}`} style={styles.pairCodeCell}>
          <Text style={styles.pairCodeText}>{char === "-" ? "" : char}</Text>
        </View>
      ))}
    </View>
  );
}
