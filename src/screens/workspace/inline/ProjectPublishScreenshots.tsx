import React, { useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useThemedColor } from "../../../context/PreferencesContext";
import { colors } from "../../../styles/theme";
import { ProjectDisplay } from "../types";
import { PUBLISH_ASSET_CREDIT_COST } from "./ProjectPublishModal.data";
import { modalStyles } from "./ProjectPublishModal.styles";

export function ProjectPublishScreenshots({ busy, description, generating, onGenerateAsset, project, setUrls, title, urls }: {
  busy: boolean;
  description: string;
  generating: boolean;
  onGenerateAsset: (kind: "logo" | "screenshot", payload: { description: string; prompt: string; title: string }) => Promise<string | null>;
  project: ProjectDisplay | null;
  setUrls: React.Dispatch<React.SetStateAction<string[]>>;
  title: string;
  urls: string[];
}) {
  const [attachError, setAttachError] = useState("");
  const addIcon = useThemedColor("#D2CBE2");

  function add(image: string) {
    setUrls((current) => appendScreenshot(current, image));
    setAttachError("");
  }

  async function attachScreenshot() {
    setAttachError("");
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setAttachError("Allow photo access to attach screenshots.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [16, 9],
        base64: true,
        mediaTypes: ["images"],
        quality: 0.88
      });

      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.base64) {
        setAttachError("That screenshot could not be attached.");
        return;
      }

      add(`data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`);
    } catch {
      setAttachError("That screenshot could not be attached.");
    }
  }

  function confirmGenerateScreenshot() {
    const cost = PUBLISH_ASSET_CREDIT_COST.screenshot;
    Alert.alert(
      "Generate screenshot?",
      `This will use ${cost} Vibyra credits from your account.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: `Generate (${cost} credits)`, onPress: generateScreenshot }
      ]
    );
  }

  async function generateScreenshot() {
    const image = await onGenerateAsset("screenshot", {
      title: title.trim(),
      description: description.trim(),
      prompt: `${title.trim() || project?.name || "Vibyra project"} app screenshot, polished mobile UI`
    });
    if (image) add(image);
  }

  return (
    <>
      <View style={modalStyles.screenshotHeader}>
        <Text style={modalStyles.label}>Screenshots (optional)</Text>
        {urls.length ? <Text style={modalStyles.screenshotCount}>{urls.length}/4</Text> : null}
      </View>
      <View style={modalStyles.screenshotRow}>
        {urls.map((url, index) => (
          <View key={`${url}-${index}`} style={modalStyles.screenshotThumb}>
            <Image source={{ uri: url }} style={modalStyles.screenshotImage} />
            <Pressable disabled={busy} onPress={() => setUrls((current) => current.filter((_, i) => i !== index))} style={modalStyles.screenshotRemove}>
              <Ionicons name="close" color={colors.text} size={12} />
            </Pressable>
          </View>
        ))}
        {urls.length < 4 ? (
          <>
            <Pressable disabled={busy} onPress={attachScreenshot} style={modalStyles.screenshotAdd}>
              <Ionicons name="image-outline" color={addIcon} size={18} />
              <Text style={modalStyles.addTagText}>Add</Text>
            </Pressable>
            <Pressable disabled={busy || generating} onPress={confirmGenerateScreenshot} style={modalStyles.screenshotAddAi}>
              {generating ? <ActivityIndicator color={colors.text} size="small" /> : <Ionicons name="sparkles" color={colors.text} size={15} />}
            </Pressable>
          </>
        ) : null}
      </View>
      {attachError ? <Text style={modalStyles.screenshotError}>{attachError}</Text> : null}
    </>
  );
}

function appendScreenshot(current: string[], image: string) {
  const next = image.trim();
  if (!next) return current;
  return [...current, next].slice(0, 4);
}
