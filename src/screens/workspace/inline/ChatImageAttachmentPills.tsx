import React from "react";
import { Image, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ChatImageAttachment } from "../../../types/chatTools";
import { styles } from "../styles";

export function ChatImageAttachmentPills({
  attachments,
  onRemove
}: {
  attachments: ChatImageAttachment[];
  onRemove: (id: string) => void;
}) {
  if (attachments.length === 0) return null;

  return (
    <View style={styles.chatImageAttachmentRow}>
      {attachments.map((attachment) => (
        <View key={attachment.id} style={styles.chatImageAttachmentPill}>
          <Image source={{ uri: attachment.dataUrl }} style={styles.chatImageAttachmentThumb} />
          <View style={styles.chatImageAttachmentCopy}>
            <Text numberOfLines={1} style={styles.chatImageAttachmentName}>{attachment.name}</Text>
            <Text numberOfLines={1} style={styles.chatImageAttachmentMeta}>{imageMeta(attachment)}</Text>
          </View>
          <Pressable accessibilityLabel={`Remove ${attachment.name}`} onPress={() => onRemove(attachment.id)} style={styles.chatImageAttachmentRemove}>
            <Ionicons name="close" color="#BDB5CE" size={14} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function imageMeta(attachment: ChatImageAttachment) {
  const size = attachment.width && attachment.height ? `${attachment.width}x${attachment.height}` : "Image";
  return `${size} · ${attachment.mimeType.replace(/^image\//, "").toUpperCase()}`;
}
