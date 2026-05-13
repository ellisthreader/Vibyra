import React, { useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { colors } from "../../../styles/theme";
import { PUBLISH_ASSET_CREDIT_COST } from "./ProjectPublishModal.data";
import { modalStyles } from "./ProjectPublishModal.styles";

export function ProjectPublishIcon({ busy, description, generating, imageUrl, onGenerateAsset, setImageUrl, title }: {
  busy: boolean;
  description: string;
  generating: boolean;
  imageUrl: string;
  onGenerateAsset: (kind: "logo" | "screenshot", payload: { description: string; prompt: string; title: string }) => Promise<string | null>;
  setImageUrl: (value: string) => void;
  title: string;
}) {
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [attachError, setAttachError] = useState("");

  async function attachImage() {
    setAttachError("");
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setAttachError("Allow photo access to attach an icon.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        base64: true,
        mediaTypes: ["images"],
        quality: 0.86
      });

      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.base64) {
        setAttachError("That image could not be attached.");
        return;
      }

      setImageUrl(`data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`);
    } catch {
      setAttachError("That image could not be attached.");
    }
  }

  function confirmGenerateIcon() {
    const cost = PUBLISH_ASSET_CREDIT_COST.logo;
    Alert.alert(
      "Generate icon?",
      `This will use ${cost} Vibyra credits from your account.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: `Generate (${cost} credits)`, onPress: generateIcon }
      ]
    );
  }

  async function generateIcon() {
    const image = await onGenerateAsset("logo", {
      title: title.trim(),
      description: description.trim(),
      prompt: aiPrompt.trim()
    });
    if (image) setImageUrl(image);
    setAiPrompt("");
    setAiOpen(false);
  }

  return (
    <View style={modalStyles.iconEditor}>
      <View style={modalStyles.iconPreview}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={modalStyles.iconImage} />
        ) : (
          <Ionicons name="cube-outline" color="#B970FF" size={30} />
        )}
      </View>
      <View style={modalStyles.iconActions}>
        <Pressable disabled={busy} onPress={attachImage} style={modalStyles.iconAction}>
          <Ionicons name="image-outline" color={colors.text} size={17} />
        </Pressable>
        <Pressable disabled={busy || generating} onPress={() => setAiOpen((value) => !value)} style={[modalStyles.iconAction, modalStyles.iconActionAi]}>
          {generating ? <ActivityIndicator color={colors.text} size="small" /> : <Ionicons name="sparkles" color={colors.text} size={15} />}
        </Pressable>
      </View>
      {attachError ? <Text style={modalStyles.iconError}>{attachError}</Text> : null}
      {aiOpen ? (
        <View style={modalStyles.iconInputWrap}>
          <TextInput
            editable={!busy}
            onChangeText={setAiPrompt}
            placeholder="Describe the icon you want AI to generate"
            placeholderTextColor="#827C92"
            style={modalStyles.iconInput}
            value={aiPrompt}
          />
          <Pressable disabled={busy || generating || !aiPrompt.trim()} onPress={confirmGenerateIcon} style={modalStyles.iconAttach}>
            {generating ? <ActivityIndicator color={colors.text} size="small" /> : <Ionicons name="sparkles" color={colors.text} size={15} />}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
