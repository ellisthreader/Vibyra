import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemedColor } from "../../../context/PreferencesContext";
import { colors } from "../../../styles/theme";
import { ProjectDisplay } from "../types";
import { addUniqueTag, defaultTags, inferCategory, publishTags, PUBLISH_CATEGORIES, VISIBILITY_OPTIONS, VisibilityKey } from "./ProjectPublishModal.data";
import { modalStyles } from "./ProjectPublishModal.styles";
import { ProjectPublishIcon } from "./ProjectPublishIcon";
import { ProjectPublishScreenshots } from "./ProjectPublishScreenshots";

export function ProjectPublishModal({
  busy,
  error,
  generating,
  onGenerateAsset,
  onClose,
  onPublish,
  project
}: {
  busy: boolean;
  error: string;
  generating?: "logo" | "screenshot" | null;
  onClose: () => void;
  onGenerateAsset: (kind: "logo" | "screenshot", payload: { description: string; prompt: string; title: string }) => Promise<string | null>;
  onPublish: (payload: { description: string; logoImageUrl: string; screenshotUrls: string[]; tags: string[]; title: string; visibility: VisibilityKey }) => void;
  project: ProjectDisplay | null;
}) {
  const [category, setCategory] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [logoImageUrl, setLogoImageUrl] = useState("");
  const [screenshotUrls, setScreenshotUrls] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [tagInputOpen, setTagInputOpen] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<"public" | "unlisted" | "private">("public");
  const insets = useSafeAreaInsets();
  const closeIcon = useThemedColor("#D8D2E8");
  const placeholderColor = useThemedColor("#827C92");
  const chevronColor = useThemedColor("#B8B1C8");
  const accentIcon = useThemedColor("#B970FF");
  const mutedIcon = useThemedColor("#D3CCE4");
  const chipCloseIcon = useThemedColor("#DDD6F0");
  const addIcon = useThemedColor("#D2CBE2");

  useEffect(() => {
    setTitle(project?.name ?? "");
    setDescription(project ? `A ${project.stack || "Vibyra"} project built with Vibyra.` : "");
    setCategory(inferCategory(project?.stack));
    setCategoryOpen(false);
    setLogoImageUrl("");
    setScreenshotUrls([]);
    setTagDraft("");
    setTagInputOpen(false);
    setTags(defaultTags(project));
    setVisibility("public");
  }, [project]);

  const canPublish = Boolean(project && title.trim() && description.trim() && !busy);

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen" visible={project !== null}>
      <View style={modalStyles.page}>
        <View style={[modalStyles.header, { paddingTop: Math.max(insets.top + 4, 14) }]}>
          <Pressable accessibilityLabel="Close publish page" disabled={busy} hitSlop={12} onPress={onClose} style={modalStyles.headerButton}>
            <Ionicons name="close" color={closeIcon} size={28} />
          </Pressable>
          <Text style={modalStyles.headerTitle}>Publish</Text>
          <View style={modalStyles.headerButton} />
        </View>
        <ScrollView contentContainerStyle={modalStyles.content} showsVerticalScrollIndicator={false}>
          <View style={modalStyles.formPanel}>
            <ProjectPublishIcon
              busy={busy}
              description={description}
              generating={generating === "logo"}
              imageUrl={logoImageUrl}
              onGenerateAsset={onGenerateAsset}
              setImageUrl={setLogoImageUrl}
              title={title}
            />

            <FieldLabel label="Project name" />
            <TextInput editable={!busy} onChangeText={setTitle} placeholder="Project name" placeholderTextColor={placeholderColor} style={modalStyles.input} value={title} />

            <FieldLabel label="Project description" />
            <TextInput editable={!busy} multiline onChangeText={setDescription} placeholder="Describe what this project does" placeholderTextColor={placeholderColor} style={[modalStyles.input, modalStyles.textarea]} value={description} />

            <FieldLabel label="Primary category" />
            <Pressable disabled={busy} onPress={() => setCategoryOpen((value) => !value)} style={modalStyles.select}>
              <Text style={modalStyles.selectText}>{category}</Text>
              <Ionicons name={categoryOpen ? "chevron-up" : "chevron-down"} color={chevronColor} size={20} />
            </Pressable>
            {categoryOpen ? (
              <View style={modalStyles.categoryMenu}>
                {PUBLISH_CATEGORIES.map((item) => (
                  <Pressable key={item} disabled={busy} onPress={() => { setCategory(item); setCategoryOpen(false); }} style={modalStyles.categoryOption}>
                    <Text style={[modalStyles.categoryText, item === category ? modalStyles.categoryTextActive : null]}>{item}</Text>
                    {item === category ? <Ionicons name="checkmark" color={accentIcon} size={17} /> : null}
                  </Pressable>
                ))}
              </View>
            ) : null}

            <FieldLabel label="Add tags (optional)" />
            <View style={modalStyles.tagsRow}>
              {tags.map((tag) => (
                <View key={tag} style={modalStyles.tagChip}>
                  <Text style={modalStyles.tagText}>{tag}</Text>
                  <Pressable disabled={busy} onPress={() => setTags((current) => current.filter((item) => item !== tag))}>
                    <Ionicons name="close" color={chipCloseIcon} size={15} />
                  </Pressable>
                </View>
              ))}
              {tagInputOpen ? (
                <View style={modalStyles.tagInputWrap}>
                  <TextInput
                    autoFocus
                    editable={!busy}
                    onChangeText={setTagDraft}
                    onSubmitEditing={() => {
                      setTags((current) => addUniqueTag(current, tagDraft));
                      setTagDraft("");
                      setTagInputOpen(false);
                    }}
                    placeholder="Tag"
                    placeholderTextColor={placeholderColor}
                    style={modalStyles.tagInput}
                    value={tagDraft}
                  />
                  <Pressable disabled={busy || !tagDraft.trim()} onPress={() => {
                    setTags((current) => addUniqueTag(current, tagDraft));
                    setTagDraft("");
                    setTagInputOpen(false);
                  }}>
                    <Ionicons name="checkmark" color={accentIcon} size={18} />
                  </Pressable>
                </View>
              ) : (
                <Pressable disabled={busy || tags.length >= 8} onPress={() => setTagInputOpen(true)} style={modalStyles.addTag}>
                  <Ionicons name="add" color={addIcon} size={18} />
                  <Text style={modalStyles.addTagText}>Add tag</Text>
                </Pressable>
              )}
            </View>

            <ProjectPublishScreenshots
              busy={busy}
              description={description}
              generating={generating === "screenshot"}
              onGenerateAsset={onGenerateAsset}
              project={project}
              setUrls={setScreenshotUrls}
              title={title}
              urls={screenshotUrls}
            />

            <FieldLabel label="Visibility" />
            <View style={modalStyles.visibilityRow}>
              {VISIBILITY_OPTIONS.map((option) => (
                <Pressable
                  key={option.key}
                  disabled={busy}
                  onPress={() => setVisibility(option.key)}
                  style={[modalStyles.visibilityCard, visibility === option.key ? modalStyles.visibilityCardActive : null]}
                >
                  <Ionicons name={option.icon} color={visibility === option.key ? accentIcon : mutedIcon} size={30} />
                  <Text style={modalStyles.visibilityTitle}>{option.title}</Text>
                  <View style={[modalStyles.radio, visibility === option.key ? modalStyles.radioActive : null]}>
                    {visibility === option.key ? <View style={modalStyles.radioDot} /> : null}
                  </View>
                </Pressable>
              ))}
            </View>

            {error ? <Text style={modalStyles.error}>{error}</Text> : null}
            <View style={modalStyles.actions}>
              <Pressable disabled={busy} style={modalStyles.secondary} onPress={onClose}><Text style={modalStyles.secondaryText}>Cancel</Text></Pressable>
              <Pressable
                disabled={!canPublish}
                style={[modalStyles.primary, !canPublish ? modalStyles.primaryDisabled : null]}
                onPress={() => onPublish({ title: title.trim(), description: description.trim(), logoImageUrl: logoImageUrl.trim(), screenshotUrls, tags: publishTags(tags, category), visibility })}
              >
                <LinearGradient colors={["#7028FF", "#8B35FF", "#6D35FF"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={modalStyles.primaryGradient} />
                {busy ? <ActivityIndicator color={colors.text} size="small" /> : <Ionicons name="cloud-upload-outline" color={colors.text} size={22} />}
                <Text style={[modalStyles.primaryText, { color: "#FFFFFF" }]}>{busy ? "Publishing" : "Publish"}</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function FieldLabel({ label }: { label: string }) { return <Text style={modalStyles.label}>{label}</Text>; }
