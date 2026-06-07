import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemedColor } from "../../../context/PreferencesContext";
import { colors } from "../../../styles/theme";
import type { ProjectPublishStatus } from "../../../utils/communityApi";
import { ProjectDisplay } from "../types";
import { addUniqueTag, publishTags, PUBLISH_CATEGORIES, suggestPublishMetadata, VISIBILITY_OPTIONS, VisibilityKey } from "./ProjectPublishModal.data";
import { modalStyles } from "./ProjectPublishModal.styles";
import { ProjectPublishCompletion } from "./ProjectPublishCompletion";
import { ProjectPublishIcon } from "./ProjectPublishIcon";
import { publishResultFromStatus, type PublishFlowResult, isPublishReviewLocked } from "./ProjectPublishResult";
import { ProjectPublishScreenshots } from "./ProjectPublishScreenshots";
import { ProjectPublishStatusPanel } from "./ProjectPublishStatusPanel";
import { FieldLabel, StatusLine } from "./ProjectPublishSections";

export function ProjectPublishModal({ busy, error, generating, onGenerateAsset, onClose, onPublish, onResultComplete, project, publishStatus, result }: {
  busy: boolean;
  error: string;
  generating?: "logo" | "screenshot" | null;
  onClose: () => void;
  onGenerateAsset: (kind: "logo" | "screenshot", payload: { description: string; prompt: string; title: string }) => Promise<string | null>;
  onPublish: (payload: { description: string; logoImageUrl: string; screenshotUrls: string[]; tags: string[]; title: string; visibility: VisibilityKey }) => void;
  onResultComplete: (result: NonNullable<PublishFlowResult>) => void;
  project: ProjectDisplay | null;
  publishStatus?: ProjectPublishStatus | null;
  result?: PublishFlowResult;
}) {
  const [category, setCategory] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [logoImageUrl, setLogoImageUrl] = useState("");
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const [screenshotUrls, setScreenshotUrls] = useState<string[]>([]);
  const [suggestedCategory, setSuggestedCategory] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [tagInputOpen, setTagInputOpen] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<VisibilityKey>("public");
  const insets = useSafeAreaInsets();
  const closeIcon = useThemedColor("#D8D2E8");
  const placeholderColor = useThemedColor("#827C92");
  const chevronColor = useThemedColor("#B8B1C8");
  const accentIcon = useThemedColor("#B970FF");
  const chipCloseIcon = useThemedColor("#DDD6F0");
  const addIcon = useThemedColor("#D2CBE2");

  useEffect(() => {
    const suggestion = suggestPublishMetadata(project);
    const existingProject = publishStatus?.project;
    const savedTags = publishStatus?.tags?.length ? publishStatus.tags : existingProject?.tags ?? [];
    const savedCategory = savedTags.find((tag) => (PUBLISH_CATEGORIES as readonly string[]).includes(tag));
    const nextCategory = savedCategory || suggestion.category;
    setTitle(publishStatus?.title || existingProject?.title || project?.name || "");
    setDescription(publishStatus?.description || existingProject?.description || suggestion.description);
    setCategory(nextCategory);
    setSuggestedCategory(suggestion.category);
    setCategoryOpen(false);
    setMoreOptionsOpen(false);
    setLogoImageUrl(publishStatus?.logoImageUrl || existingProject?.logoImageUrl || "");
    setScreenshotUrls((publishStatus?.screenshotUrls?.length ? publishStatus.screenshotUrls : existingProject?.screenshotUrls) ?? []);
    setTagDraft("");
    setTagInputOpen(false);
    setTags(savedTags.length ? savedTags.filter((tag) => tag !== nextCategory).slice(0, 8) : suggestion.tags);
    setVisibility(publishStatus?.visibility || existingProject?.visibility || "public");
  }, [project, publishStatus]);

  const canPublish = Boolean(project && title.trim() && description.trim() && !busy);
  const activeVisibility = VISIBILITY_OPTIONS.find((option) => option.key === visibility) ?? VISIBILITY_OPTIONS[0];
  const categorySuggested = Boolean(category && category === suggestedCategory);
  const statusResult = publishResultFromStatus(publishStatus);
  const lockedStatus = isPublishReviewLocked(publishStatus);
  const editingListing = Boolean(publishStatus?.id || publishStatus?.sourceProjectId);

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen" visible={project !== null}>
      <View style={modalStyles.page}>
        <View style={[modalStyles.header, { paddingTop: Math.max(insets.top + 8, 60) }]}>
          <Pressable accessibilityLabel="Close publish page" disabled={busy} hitSlop={12} onPress={onClose} style={modalStyles.headerButton}>
            <Ionicons name="close" color={closeIcon} size={27} />
          </Pressable>
          <Text style={modalStyles.headerTitle}>{editingListing ? "Edit Explore listing" : "Publish to Explore"}</Text>
          <View style={modalStyles.headerButton} />
        </View>

        {result ? <ProjectPublishCompletion onDone={onResultComplete} result={result} /> : lockedStatus && statusResult ? <ProjectPublishStatusPanel onClose={onClose} result={statusResult} /> : (
        <ScrollView contentContainerStyle={[modalStyles.content, { paddingBottom: Math.max(insets.bottom + 20, 28) }]} showsVerticalScrollIndicator={false}>
          {statusResult ? <StatusLine tone={statusResult.tone} title={statusResult.title} message={statusResult.message} /> : null}
          <View style={[modalStyles.section, modalStyles.firstSection]}>
            <View style={modalStyles.sectionHeader}>
              <Text style={modalStyles.sectionTitle}>Project details</Text>
              <Text style={modalStyles.requiredText}>Required</Text>
            </View>
            <FieldLabel label="Project name" />
            <TextInput editable={!busy} onChangeText={setTitle} placeholder="Project name" placeholderTextColor={placeholderColor} style={[modalStyles.input, modalStyles.titleInput]} value={title} />
            <FieldLabel label="Description" />
            <TextInput editable={!busy} multiline onChangeText={setDescription} placeholder="Describe what this project does" placeholderTextColor={placeholderColor} style={[modalStyles.input, modalStyles.textarea]} value={description} />
          </View>

          <View style={modalStyles.section}>
            <View style={modalStyles.sectionHeader}>
              <Text style={modalStyles.sectionTitle}>Visibility</Text>
              <Text style={modalStyles.sectionMeta}>{activeVisibility.title}</Text>
            </View>
            <View style={modalStyles.visibilitySegment}>
              {VISIBILITY_OPTIONS.map((option) => {
                const active = visibility === option.key;
                return (
                  <Pressable key={option.key} disabled={busy} onPress={() => setVisibility(option.key)} style={[modalStyles.visibilitySegmentOption, active ? modalStyles.visibilitySegmentOptionActive : null]}>
                    <Ionicons name={option.icon} color={active ? accentIcon : chevronColor} size={17} />
                    <Text style={[modalStyles.visibilitySegmentText, active ? modalStyles.visibilitySegmentTextActive : null]}>{option.title}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={modalStyles.visibilityCopy}>{activeVisibility.copy}</Text>
          </View>

          <View style={modalStyles.section}>
            <Pressable disabled={busy} onPress={() => setMoreOptionsOpen((value) => !value)} style={modalStyles.moreOptionsRow}>
              <View style={modalStyles.moreOptionsCopy}>
                <Text style={modalStyles.moreOptionsTitle}>More options</Text>
                <Text style={modalStyles.moreOptionsText}>Photos, category, tags, and app icon</Text>
              </View>
              <Ionicons name={moreOptionsOpen ? "chevron-up" : "chevron-down"} color={chevronColor} size={20} />
            </Pressable>
            {moreOptionsOpen ? (
              <View style={modalStyles.moreOptionsPanel}>
                <View style={modalStyles.nestedSection}>
                  <View style={modalStyles.sectionHeader}>
                    <Text style={modalStyles.sectionTitle}>Photos</Text>
                    <Text style={modalStyles.sectionMeta}>{screenshotUrls.length}/4</Text>
                  </View>
                  <ProjectPublishScreenshots busy={busy} description={description} generating={generating === "screenshot"} onGenerateAsset={onGenerateAsset} project={project} setUrls={setScreenshotUrls} title={title} urls={screenshotUrls} />
                </View>

                <View style={modalStyles.nestedSection}>
                  <View style={modalStyles.sectionHeader}>
                    <Text style={modalStyles.sectionTitle}>Discovery</Text>
                    <Text style={modalStyles.sectionMeta}>AI suggested</Text>
                  </View>
                  <FieldLabel label="Primary category" />
                  <Pressable disabled={busy} onPress={() => setCategoryOpen((value) => !value)} style={modalStyles.select}>
                    <View style={modalStyles.selectValueRow}>
                      <Text style={modalStyles.selectText}>{category}</Text>
                      {categorySuggested ? <Text style={modalStyles.suggestedPill}>Suggested</Text> : null}
                    </View>
                    <Ionicons name={categoryOpen ? "chevron-up" : "chevron-down"} color={chevronColor} size={20} />
                  </Pressable>
                  {categoryOpen ? (
                    <View style={modalStyles.categoryMenu}>
                      {PUBLISH_CATEGORIES.map((item) => (
                        <Pressable key={item} disabled={busy} onPress={() => { setCategory(item); setCategoryOpen(false); }} style={modalStyles.categoryOption}>
                          <View style={modalStyles.categoryOptionCopy}>
                            <Text style={[modalStyles.categoryText, item === category ? modalStyles.categoryTextActive : null]}>{item}</Text>
                            {item === suggestedCategory ? <Text style={modalStyles.categorySuggestedText}>Suggested</Text> : null}
                          </View>
                          {item === category ? <Ionicons name="checkmark" color={accentIcon} size={17} /> : null}
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  <FieldLabel label="Tags" />
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
                        <TextInput autoFocus editable={!busy} onChangeText={setTagDraft} onSubmitEditing={() => addTag()} placeholder="Tag" placeholderTextColor={placeholderColor} style={modalStyles.tagInput} value={tagDraft} />
                        <Pressable disabled={busy || !tagDraft.trim()} onPress={addTag}><Ionicons name="checkmark" color={accentIcon} size={18} /></Pressable>
                      </View>
                    ) : (
                      <Pressable disabled={busy || tags.length >= 8} onPress={() => setTagInputOpen(true)} style={modalStyles.addTag}>
                        <Ionicons name="add" color={addIcon} size={18} />
                        <Text style={modalStyles.addTagText}>Add tag</Text>
                      </Pressable>
                    )}
                  </View>
                </View>

                <View style={modalStyles.nestedSectionLast}>
                  <View style={modalStyles.sectionHeader}>
                    <Text style={modalStyles.sectionTitle}>App icon</Text>
                    <Text style={modalStyles.sectionMeta}>Optional</Text>
                  </View>
                  <ProjectPublishIcon busy={busy} description={description} generating={generating === "logo"} imageUrl={logoImageUrl} onGenerateAsset={onGenerateAsset} setImageUrl={setLogoImageUrl} title={title} />
                </View>
              </View>
            ) : null}
          </View>

          <View style={modalStyles.publishBlock}>
            {error ? <Text style={modalStyles.error}>{error}</Text> : null}
            <Pressable disabled={!canPublish} style={[modalStyles.primary, !canPublish ? modalStyles.primaryDisabled : null]} onPress={() => onPublish({ title: title.trim(), description: description.trim(), logoImageUrl: logoImageUrl.trim(), screenshotUrls, tags: publishTags(tags, category), visibility })}>
              <LinearGradient colors={["#7028FF", "#8B35FF", "#6D35FF"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={modalStyles.primaryGradient} />
              {busy ? <ActivityIndicator color={colors.text} size="small" /> : <Ionicons name="cloud-upload-outline" color={colors.text} size={21} />}
              <Text style={modalStyles.primaryText}>{busy ? (editingListing ? "Updating" : "Publishing") : (editingListing ? "Update" : "Publish")}</Text>
            </Pressable>
          </View>
        </ScrollView>
        )}
      </View>
    </Modal>
  );

  function addTag() {
    setTags((current) => addUniqueTag(current, tagDraft));
    setTagDraft("");
    setTagInputOpen(false);
  }
}
