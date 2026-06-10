import * as AppleAuthentication from "expo-apple-authentication";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { styles } from "./styles";

export function AppleAuthChoice({
  busy,
  onPress,
  scale
}: {
  busy: boolean;
  onPress: () => void;
  scale: number;
}) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    AppleAuthentication.isAvailableAsync().then(setAvailable).catch(() => setAvailable(false));
  }, []);

  if (!available) return null;
  const height = Math.max(48, 56 * scale);

  return (
    <View style={[styles.appleButtonWrap, { height }]}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        cornerRadius={height / 2}
        onPress={onPress}
        style={{ height, width: "100%" }}
      />
      {busy ? (
        <View pointerEvents="none" style={styles.appleButtonBusy}>
          <ActivityIndicator color="#FFFFFF" size="small" />
        </View>
      ) : null}
    </View>
  );
}
