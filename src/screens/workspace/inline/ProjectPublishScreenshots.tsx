import React, { useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, Text, TextInput, View } from "react-native";
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
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [attachError, setAttachError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const addIcon = useThemedColor("#D2CBE2");
  const placeholderColor = useThemedColor("#827C92");

  function add(image: string) {
    setUrls((current) => appendScreenshot(current, image));
    setAiOpen(false);
    setAttachError("");
    setMenuOpen(false);
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
    setMenuOpen(false);
    Alert.alert(
      "Generate screenshot?",
      `This will charge ${cost} tokens from your account.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: `Charge ${cost} tokens`, onPress: generateScreenshot }
      ]
    );
  }

  async function generateScreenshot() {
    const image = await onGenerateAsset("screenshot", {
      title: title.trim(),
      description: description.trim(),
      prompt: aiPrompt.trim() || `${title.trim() || project?.name || "Vibyra project"} app screenshot, polished mobile UI`
    });
    if (image) {
      add(image);
      setAiPrompt("");
    }
  }

  return (
    <>
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
          <Pressable
            accessibilityLabel="Add project screenshot"
            disabled={busy}
            onPress={() => setMenuOpen((value) => !value)}
            style={modalStyles.screenshotAdd}
          >
            <Ionicons name="add" color={addIcon} size={18} />
            <Text style={modalStyles.addTagText}>Add screenshot</Text>
            <Ionicons name={menuOpen ? "chevron-up" : "chevron-down"} color={addIcon} size={16} />
          </Pressable>
        ) : null}
      </View>
      {menuOpen && urls.length < 4 ? (
        <View style={modalStyles.categoryMenu}>
          <Pressable disabled={busy} onPress={attachScreenshot} style={modalStyles.categoryOption}>
            <Text style={modalStyles.categoryText}>Choose from photos</Text>
            <Ionicons name="image-outline" color={addIcon} size={17} />
          </Pressable>
          <Pressable disabled={busy || generating} onPress={() => { setAiOpen(true); setMenuOpen(false); }} style={modalStyles.categoryOption}>
            <Text style={modalStyles.categoryText}>{generating ? "Generating screenshot" : `Generate with AI · ${PUBLISH_ASSET_CREDIT_COST.screenshot} tokens`}</Text>
            {generating ? <ActivityIndicator color={colors.text} size="small" /> : <Ionicons name="sparkles" color={addIcon} size={16} />}
          </Pressable>
        </View>
      ) : null}
      {aiOpen ? (
        <View style={modalStyles.aiPromptBox}>
          <TextInput
            editable={!busy}
            multiline
            onChangeText={setAiPrompt}
            placeholder="Describe the screenshot you want"
            placeholderTextColor={placeholderColor}
            style={modalStyles.aiPromptInput}
            value={aiPrompt}
          />
          <Pressable accessibilityLabel="Generate screenshot with AI" disabled={busy || generating} onPress={confirmGenerateScreenshot} style={modalStyles.tokenCostButton}>
            {generating ? <ActivityIndicator color={colors.text} size="small" /> : <Text style={modalStyles.tokenCostButtonText}>{PUBLISH_ASSET_CREDIT_COST.screenshot} tokens</Text>}
          </Pressable>
        </View>
      ) : null}
      {attachError ? <Text style={modalStyles.screenshotError}>{attachError}</Text> : null}
    </>
  );
}

function appendScreenshot(current: string[], image: string) {
  const next = image.trim();
  if (!next) return current;
  return [...current, next].slice(0, 4);
}
