import React from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ChatFileAttachment, ChatImageAttachment } from "../../../types/chatTools";
import { styles } from "../styles";

export function ChatImageAttachmentPills({
  fileAttachments,
  imageAttachments,
  onRemoveFile,
  onRemoveImage,
  variant = "composer"
}: {
  fileAttachments: ChatFileAttachment[];
  imageAttachments: ChatImageAttachment[];
  onRemoveFile?: (id: string) => void;
  onRemoveImage?: (id: string) => void;
  variant?: "composer" | "message";
}) {
  if (imageAttachments.length === 0 && fileAttachments.length === 0) return null;
  const messageVariant = variant === "message";

  return (
    <ScrollView
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      style={messageVariant ? styles.chatMessageAttachmentRow : styles.chatImageAttachmentRow}
      contentContainerStyle={messageVariant ? styles.chatMessageAttachmentRowContent : styles.chatImageAttachmentRowContent}
    >
      {imageAttachments.map((attachment) => (
        <View key={attachment.id} style={messageVariant ? styles.chatMessageImageAttachmentPreview : styles.chatImageAttachmentPreview}>
          <Image resizeMode="cover" source={{ uri: attachment.dataUrl }} style={messageVariant ? styles.chatMessageImageAttachmentThumb : styles.chatImageAttachmentThumb} />
          {onRemoveImage ? (
            <Pressable accessibilityLabel={`Remove ${attachment.name}`} onPress={() => onRemoveImage(attachment.id)} style={styles.chatImageAttachmentPreviewRemove}>
              <Ionicons name="close" color="#FFFFFF" size={12} />
            </Pressable>
          ) : null}
        </View>
      ))}
      {fileAttachments.map((attachment) => (
        <View key={attachment.id} style={messageVariant ? styles.chatMessageFileAttachmentCard : styles.chatImageAttachmentPill}>
          <View style={messageVariant ? styles.chatMessageFileAttachmentIcon : styles.chatFileAttachmentThumb}>
            <Ionicons name={fileIcon(attachment)} color="#EDE2FF" size={messageVariant ? 21 : 17} />
          </View>
          <View style={styles.chatImageAttachmentCopy}>
            <Text numberOfLines={1} style={styles.chatImageAttachmentName}>{attachment.name}</Text>
            <Text numberOfLines={1} style={styles.chatImageAttachmentMeta}>{fileMeta(attachment)}</Text>
          </View>
          {onRemoveFile ? (
            <Pressable accessibilityLabel={`Remove ${attachment.name}`} onPress={() => onRemoveFile(attachment.id)} style={styles.chatImageAttachmentRemove}>
              <Ionicons name="close" color="#BDB5CE" size={14} />
            </Pressable>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

function fileMeta(attachment: ChatFileAttachment) {
  const type = attachment.mimeType?.split("/").pop()?.toUpperCase() || "FILE";
  const status = attachment.readStatus === "loaded"
    ? "TEXT READY"
    : attachment.readStatus === "failed"
      ? "TEXT UNREADABLE"
      : attachment.readStatus === "unsupported"
        ? "PREVIEW ONLY"
        : "";
  return [type, attachment.size ? formatBytes(attachment.size) : "", status].filter(Boolean).join(" · ");
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function fileIcon(attachment: ChatFileAttachment): keyof typeof Ionicons.glyphMap {
  const mime = (attachment.mimeType ?? "").toLowerCase();
  const name = attachment.name.toLowerCase();
  if (mime.includes("pdf") || name.endsWith(".pdf")) return "document-outline";
  if (mime.includes("zip") || /\.(zip|tar|gz|rar|7z)$/i.test(name)) return "archive-outline";
  if (mime.includes("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(name)) return "image-outline";
  if (/\.(js|jsx|ts|tsx|json|css|html|php|py|rb|go|rs)$/i.test(name)) return "code-slash-outline";
  return "document-text-outline";
}
