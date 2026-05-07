import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { AuthMethod, IconName } from "./types";
import { styles } from "./styles";

export function AuthProviderIcon({ icon, method, scale }: { icon: IconName; method: AuthMethod; scale: number }) {
  const iconBoxWidth = 40 * scale;

  if (method === "google") {
    return (
      <View style={[styles.googleIcon, { height: 34 * scale, width: iconBoxWidth }]}>
        <Svg width={30 * scale} height={30 * scale} viewBox="0 0 24 24">
          <Path fill="#4285F4" d="M23.49 12.27c0-.84-.08-1.65-.21-2.43H12v4.6h6.45a5.52 5.52 0 0 1-2.39 3.62v3.01h3.88c2.27-2.09 3.55-5.17 3.55-8.8Z" />
          <Path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.93l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.27v3.1A11.99 11.99 0 0 0 12 24Z" />
          <Path fill="#FBBC05" d="M5.28 14.26A7.21 7.21 0 0 1 4.9 12c0-.78.13-1.54.38-2.26v-3.1H1.27A11.93 11.93 0 0 0 0 12c0 1.94.46 3.78 1.27 5.36l4.01-3.1Z" />
          <Path fill="#EA4335" d="M12 4.79c1.76 0 3.34.61 4.59 1.8l3.43-3.43A11.46 11.46 0 0 0 12 0 11.99 11.99 0 0 0 1.27 6.64l4.01 3.1C6.23 6.9 8.88 4.79 12 4.79Z" />
        </Svg>
      </View>
    );
  }

  return (
    <Ionicons
      name={icon}
      size={(method === "apple" ? 35 : 31) * scale}
      color={method === "apple" ? "#FFFFFF" : "#A855FF"}
      style={[styles.authIcon, { width: iconBoxWidth }]}
    />
  );
}
