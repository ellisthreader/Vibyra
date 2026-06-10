import React from "react";
import { Pressable, Text, View } from "react-native";
import { styles } from "./styles";

export function AuthLegalLinks({ scale }: { scale: number }) {
  return (
    <View style={[styles.legalBlock, { gap: 14 * scale, paddingTop: 21 * scale }]}>
      <Text style={[styles.legalIntro, { fontSize: 14 * scale, lineHeight: 20 * scale }]}>By continuing, you agree to our</Text>
      <View style={[styles.legalRow, { gap: 24 * scale }]}>
        <Pressable style={({ pressed }) => pressed ? styles.legalPressed : null}>
          <Text style={[styles.legalLink, { fontSize: 15 * scale, lineHeight: 20 * scale }]}>Privacy Policy</Text>
        </Pressable>
        <View style={[styles.legalDivider, { height: 26 * scale }]} />
        <Pressable style={({ pressed }) => pressed ? styles.legalPressed : null}>
          <Text style={[styles.legalLink, { fontSize: 15 * scale, lineHeight: 20 * scale }]}>Terms of Service</Text>
        </Pressable>
      </View>
    </View>
  );
}
