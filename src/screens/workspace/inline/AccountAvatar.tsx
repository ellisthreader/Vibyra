import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

const avatarColors = ["#4285F4", "#DB4437", "#F4B400", "#7E57C2", "#00ACC1", "#EF6C00"];

export function AccountAvatar({
  imageUri,
  name,
  size,
  textSize
}: {
  imageUri?: string;
  name: string;
  size: number;
  textSize?: number;
}) {
  const initial = getAvatarInitial(name);
  const backgroundColor = avatarColors[hashName(name || initial) % avatarColors.length];
  const frameStyle = { borderRadius: size / 2, height: size, width: size };

  if (imageUri) {
    return <Image source={{ uri: imageUri }} style={[styles.image, frameStyle]} />;
  }

  return (
    <View style={[styles.fallback, frameStyle, { backgroundColor }]}>
      <Text style={[styles.initial, { fontSize: textSize ?? Math.round(size * 0.44) }]}>{initial}</Text>
    </View>
  );
}

export function getAvatarInitial(name: string) {
  const trimmed = name.trim();
  return (trimmed.charAt(0) || "V").toUpperCase();
}

function hashName(name: string) {
  return Array.from(name.trim() || "V").reduce((total, char) => total + char.charCodeAt(0), 0);
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  image: {
    backgroundColor: "transparent"
  },
  initial: {
    color: "#FFFFFF",
    fontWeight: "800"
  }
});
