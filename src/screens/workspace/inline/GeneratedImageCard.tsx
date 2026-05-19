import React from "react";
import { Image, Text, View } from "react-native";
import type { GeneratedImage } from "../../../types/chatTools";
import { createThemedStyleSheet } from "../styles/themeTransform";

export function GeneratedImageCard({ image }: { image: GeneratedImage }) {
  return (
    <View style={cardStyles.card}>
      <Image resizeMode="cover" source={{ uri: image.url }} style={cardStyles.image} />
      <View style={cardStyles.footer}>
        <Text numberOfLines={1} style={cardStyles.title}>{image.title}</Text>
        {image.provider ? <Text numberOfLines={1} style={cardStyles.meta}>{image.provider}</Text> : null}
      </View>
    </View>
  );
}

const cardStyles = createThemedStyleSheet({
  card: {
    backgroundColor: "rgba(255,255,255,0.055)",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
    overflow: "hidden"
  },
  footer: {
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  image: {
    aspectRatio: 16 / 9,
    backgroundColor: "#0D0D15",
    width: "100%"
  },
  meta: {
    color: "#8F8A9E",
    fontSize: 11,
    fontWeight: "800"
  },
  title: {
    color: "#F7F3FF",
    fontSize: 14,
    fontWeight: "900"
  }
});
