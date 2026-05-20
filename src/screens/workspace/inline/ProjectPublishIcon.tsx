import React, { useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useThemedColor } from "../../../context/PreferencesContext";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const accentIcon = useThemedColor("#B970FF");
  const actionIcon = useThemedColor("#D2CBE2");
  const placeholderColor = useThemedColor("#827C92");

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
      setMenuOpen(false);
    } catch {
      setAttachError("That image could not be attached.");
    }
  }

  function confirmGenerateIcon() {
    const cost = PUBLISH_ASSET_CREDIT_COST.logo;
    Alert.alert(
      "Generate icon?",
      `This will charge ${cost} tokens from your account.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: `Charge ${cost} tokens`, onPress: generateIcon }
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
    setMenuOpen(false);
  }

  return (
    <View style={modalStyles.iconEditor}>
      <View style={modalStyles.iconPreview}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={modalStyles.iconImage} />
        ) : (
          <Ionicons name="cube-outline" color={accentIcon} size={30} />
        )}
      </View>
      <Pressable
        accessibilityLabel={imageUrl ? "Change project icon" : "Add project icon"}
        disabled={busy}
        onPress={() => setMenuOpen((value) => !value)}
        style={modalStyles.select}
      >
        <Text style={modalStyles.selectText}>{imageUrl ? "Icon selected" : "Add icon"}</Text>
        <Ionicons name={menuOpen ? "chevron-up" : "chevron-down"} color={actionIcon} size={19} />
      </Pressable>
      {menuOpen ? (
        <View style={modalStyles.categoryMenu}>
          <Pressable disabled={busy} onPress={attachImage} style={modalStyles.categoryOption}>
            <Text style={modalStyles.categoryText}>Choose from photos</Text>
            <Ionicons name="image-outline" color={actionIcon} size={17} />
          </Pressable>
          <Pressable disabled={busy || generating} onPress={() => { setAiOpen(true); setMenuOpen(false); }} style={modalStyles.categoryOption}>
            <Text style={modalStyles.categoryText}>{generating ? "Generating icon" : `Generate with AI · ${PUBLISH_ASSET_CREDIT_COST.logo} tokens`}</Text>
            {generating ? <ActivityIndicator color={colors.text} size="small" /> : <Ionicons name="sparkles" color={accentIcon} size={16} />}
          </Pressable>
        </View>
      ) : null}
      {attachError ? <Text style={modalStyles.iconError}>{attachError}</Text> : null}
      {aiOpen ? (
        <View style={modalStyles.iconInputWrap}>
          <TextInput
            editable={!busy}
            onChangeText={setAiPrompt}
            placeholder="Optional icon prompt"
            placeholderTextColor={placeholderColor}
            style={modalStyles.iconInput}
            value={aiPrompt}
          />
          <Pressable accessibilityLabel="Generate icon with AI" disabled={busy || generating} onPress={confirmGenerateIcon} style={modalStyles.tokenCostButton}>
            {generating ? <ActivityIndicator color={colors.text} size="small" /> : <Text style={modalStyles.tokenCostButtonText}>{PUBLISH_ASSET_CREDIT_COST.logo} tokens</Text>}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
