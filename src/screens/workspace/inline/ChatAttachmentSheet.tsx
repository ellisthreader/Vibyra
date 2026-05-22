import React from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePreferences } from "../../../context/PreferencesContext";
import type { ChatFileAttachment, ChatImageAttachment, ChatToolMode } from "../../../types/chatTools";
import { createChatFileAttachment } from "../../../utils/chatFileAttachments";
import { styles } from "../styles";
import { chatToolAccent, chatToolDescriptions, chatToolIcons, chatToolLabels } from "./chatAttachmentTools";

type IconName = keyof typeof Ionicons.glyphMap;

type AttachmentAction = {
  icon: IconName;
  label: string;
  prompt: string;
  kind?: "camera" | "photos" | "files" | "prompt";
};

const PRIMARY_ACTIONS: AttachmentAction[] = [
  { icon: "camera-outline", kind: "camera", label: "Camera", prompt: "Use this camera photo with my request:" },
  { icon: "images-outline", kind: "photos", label: "Photos", prompt: "Use this photo with my request:" },
  { icon: "folder-open-outline", kind: "files", label: "Files", prompt: "Use this file with my request:" }
];

const TOOL_ACTIONS: ChatToolMode[] = ["image", "research", "web", "analyze"];

const MAX_IMAGE_DATA_URL_CHARS = 4_500_000;

export function ChatAttachmentSheet({
  onClose,
  onSelectImageAttachment,
  onSelectFileAttachment,
  onSelectPrompt,
  onSelectTool,
  visible
}: {
  onClose: () => void;
  onSelectFileAttachment: (attachment: ChatFileAttachment) => void;
  onSelectImageAttachment: (attachment: ChatImageAttachment) => void;
  onSelectPrompt: (prompt: string) => void;
  onSelectTool: (tool: ChatToolMode) => void;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const prefs = usePreferences();
  const { height } = useWindowDimensions();
  const [busyAction, setBusyAction] = React.useState("");
  const availableHeight = height - Math.max(insets.top + 24, 48);
  const sheetHeight = Math.min(availableHeight, Math.min(460, Math.max(400, Math.round(height * 0.52))));
  const primaryIconColor = prefs.effectiveScheme === "light" ? prefs.colors.accent : "#F7F3FF";

  async function selectPrimaryAction(action: AttachmentAction) {
    if (action.kind === "camera") {
      await selectImage(action, "camera");
      return;
    }
    if (action.kind === "photos") {
      await selectImage(action, "library");
      return;
    }
    if (action.kind === "files") {
      await selectDocument(action);
      return;
    }
    onSelectPrompt(action.prompt);
  }

  async function selectDocument(action: AttachmentAction) {
    setBusyAction(action.label);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: "*/*"
      });
      if (result.canceled) return;

      const attachment = await createChatFileAttachment(result.assets[0]);
      if (attachment) {
        onSelectFileAttachment(attachment);
        if (attachment.readStatus !== "loaded") {
          Alert.alert(
            "File text unavailable",
            "The file is attached, but Vibyra may only be able to use its name and metadata. Text, code, and markdown files work best for analysis."
          );
        }
      }
    } catch {
      Alert.alert("Files unavailable", "Vibyra could not open the file picker on this device.");
    } finally {
      setBusyAction("");
    }
  }

  async function selectImage(action: AttachmentAction, source: "camera" | "library") {
    setBusyAction(action.label);
    try {
      const permission = source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(`${action.label} access needed`, `Allow ${action.label.toLowerCase()} access to use this option.`);
        return;
      }

      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync({ base64: true, mediaTypes: ["images"], quality: 0.82 })
        : await ImagePicker.launchImageLibraryAsync({ base64: true, mediaTypes: ["images"], quality: 0.82 });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset?.base64) {
        Alert.alert("Image unavailable", "That image could not be attached. Try a different image.");
        return;
      }
      const name = asset?.fileName || asset?.uri?.split("/").pop() || "selected image";
      const mimeType = asset.mimeType || "image/jpeg";
      const dataUrl = `data:${mimeType};base64,${asset.base64}`;
      if (dataUrl.length > MAX_IMAGE_DATA_URL_CHARS) {
        Alert.alert("Image too large", "Choose a smaller image so Vibyra can send it to chat.");
        return;
      }
      onSelectImageAttachment({
        id: `image-${Date.now()}-${Math.round(Math.random() * 1000)}`,
        dataUrl,
        name,
        mimeType,
        ...(asset.width ? { width: asset.width } : {}),
        ...(asset.height ? { height: asset.height } : {})
      });
    } catch {
      Alert.alert(`${action.label} unavailable`, `Vibyra could not open ${action.label.toLowerCase()} on this device.`);
    } finally {
      setBusyAction("");
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.chatAttachmentOverlay}>
        <Pressable accessibilityLabel="Close attachment menu" onPress={onClose} style={styles.chatAttachmentScrim} />
        <View style={[styles.chatAttachmentSheet, { height: sheetHeight, paddingBottom: Math.max(insets.bottom + 12, 20) }]}>
          <View style={styles.chatAttachmentHandle} />

          <View style={styles.chatAttachmentPrimaryRow}>
            {PRIMARY_ACTIONS.map((action) => (
              <Pressable
                key={action.label}
                disabled={Boolean(busyAction)}
                onPress={() => selectPrimaryAction(action)}
                style={({ pressed }) => [styles.chatAttachmentPrimaryAction, pressed ? styles.chatAttachmentPressed : null]}
              >
                <View style={styles.chatAttachmentPrimaryIcon}>
                  {busyAction === action.label ? (
                    <ActivityIndicator color={primaryIconColor} size="small" />
                  ) : (
                    <Ionicons name={action.icon} color={primaryIconColor} size={26} />
                  )}
                </View>
                <Text numberOfLines={1} style={styles.chatAttachmentPrimaryLabel}>{action.label}</Text>
              </Pressable>
            ))}
          </View>

          <ScrollView
            contentContainerStyle={styles.chatAttachmentToolList}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            {TOOL_ACTIONS.map((tool) => {
              const accent = chatToolAccent[tool];
              return (
                <Pressable
                  key={tool}
                  onPress={() => onSelectTool(tool)}
                  style={({ pressed }) => [styles.chatAttachmentToolRow, pressed ? styles.chatAttachmentPressed : null]}
                >
                  <View style={styles.chatAttachmentToolIcon}>
                    <Ionicons name={chatToolIcons[tool] as IconName} color={accent.iconColor} size={23} />
                  </View>
                  <View style={styles.chatAttachmentToolCopy}>
                    <Text numberOfLines={1} style={styles.chatAttachmentToolLabel}>{chatToolLabels[tool]}</Text>
                    <Text numberOfLines={1} style={styles.chatAttachmentToolDescription}>{chatToolDescriptions[tool]}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
