import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemedColor } from "../../../context/PreferencesContext";
import { colors } from "../../../styles/theme";
import type { ProjectPublishStatus } from "../../../utils/communityApi";
import type { ProjectDisplay } from "../types";
import {
  publishTags, PUBLISH_CATEGORIES, shouldHydratePublishForm, suggestPublishMetadata,
  type ProjectListingPayload, type VisibilityKey
} from "./ProjectPublishModal.data";
import { modalStyles } from "./ProjectPublishModal.styles";
import { ProjectPublishCompletion } from "./ProjectPublishCompletion";
import { ProjectPublishForm } from "./ProjectPublishForm";
import {
  canDeleteProjectListing, canManageProjectListing, canPublishProjectRelease,
  hasFailedCandidate, hasProjectListing, projectPublishMenuLabel, shouldShowPublishStatusOnly
} from "./ProjectPublishLifecycle";
import { publishResultFromStatus, type PublishFlowResult, type PublishProgressStage } from "./ProjectPublishResult";
import { ProjectPublishStatusPanel } from "./ProjectPublishStatusPanel";
import { StatusLine } from "./ProjectPublishSections";

type Props = {
  busy: boolean; error: string; generating?: "logo" | "screenshot" | null;
  onClose: () => void; onDeleteListing: () => void;
  onGenerateAsset: (kind: "logo" | "screenshot", payload: { description: string; prompt: string; title: string }) => Promise<string | null>;
  onPublishRelease: (payload: ProjectListingPayload) => void;
  onResultComplete: (result: NonNullable<PublishFlowResult>) => void;
  onSaveListing: (payload: ProjectListingPayload) => void;
  progress?: PublishProgressStage | null; project: ProjectDisplay | null;
  publishStatus?: ProjectPublishStatus | null; result?: PublishFlowResult;
};

export function ProjectPublishModal(p: Props) {
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
  const [visibility, setVisibilityState] = useState<VisibilityKey>("public");
  const [visibilityChanged, setVisibilityChanged] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const hydratedProjectKey = useRef("");
  const insets = useSafeAreaInsets();
  const closeIcon = useThemedColor("#D8D2E8");
  const placeholderColor = useThemedColor("#827C92");
  const chevronColor = useThemedColor("#B8B1C8");
  const accentIcon = useThemedColor("#B970FF");
  const chipCloseIcon = useThemedColor("#DDD6F0");
  const addIcon = useThemedColor("#D2CBE2");

  useEffect(() => {
    const nextProjectKey = p.project?.id || "";
    if (!shouldHydratePublishForm(hydratedProjectKey.current, nextProjectKey, formDirty)) return;
    hydratedProjectKey.current = nextProjectKey;
    const suggestion = suggestPublishMetadata(p.project);
    const existing = p.publishStatus?.project;
    const savedTags = p.publishStatus?.tags?.length ? p.publishStatus.tags : existing?.tags ?? [];
    const savedCategory = savedTags.find((tag) => (PUBLISH_CATEGORIES as readonly string[]).includes(tag));
    const nextCategory = savedCategory || suggestion.category;
    setTitle(p.publishStatus?.title || existing?.title || p.project?.name || "");
    setDescription(p.publishStatus?.description || existing?.description || suggestion.description);
    setCategory(nextCategory);
    setSuggestedCategory(suggestion.category);
    setLogoImageUrl(p.publishStatus?.logoImageUrl || existing?.logoImageUrl || "");
    setScreenshotUrls((p.publishStatus?.screenshotUrls?.length ? p.publishStatus.screenshotUrls : existing?.screenshotUrls) ?? []);
    setTags(savedTags.length ? savedTags.filter((tag) => tag !== nextCategory).slice(0, 8) : suggestion.tags);
    setVisibilityState(p.publishStatus?.visibility === "private" ? "private" : "public");
    setVisibilityChanged(false);
    setFormDirty(false);
    setCategoryOpen(false); setMoreOptionsOpen(false); setTagDraft(""); setTagInputOpen(false);
  }, [formDirty, p.project, p.publishStatus]);

  const existingListing = hasProjectListing(p.publishStatus);
  const statusResult = publishResultFromStatus(p.publishStatus);
  const statusOnly = shouldShowPublishStatusOnly(p.publishStatus, p.error);
  const canSubmit = Boolean(p.project && title.trim() && description.trim() && !p.busy);
  const payload = (): ProjectListingPayload => ({
    description: description.trim(), logoImageUrl: logoImageUrl.trim(), screenshotUrls,
    tags: publishTags(tags, category), title: title.trim(), visibility, visibilityChanged
  });
  const headerTitle = projectPublishMenuLabel(p.publishStatus);

  return <Modal animationType="slide" onRequestClose={p.onClose} presentationStyle="fullScreen" visible={p.project !== null}>
    <View style={modalStyles.page}>
      <View style={[modalStyles.header, { paddingTop: Math.max(insets.top + 8, 60) }]}>
        <Pressable accessibilityLabel="Close publish page" disabled={p.busy} hitSlop={12} onPress={p.onClose} style={modalStyles.headerButton}>
          <Ionicons name="close" color={closeIcon} size={27} />
        </Pressable>
        <Text style={modalStyles.headerTitle}>{headerTitle}</Text>
        <View style={modalStyles.headerButton} />
      </View>
      {p.result ? <ProjectPublishCompletion onDone={p.onResultComplete} result={p.result} status={p.publishStatus} />
        : statusOnly && statusResult ? <ProjectPublishStatusPanel onClose={p.onClose} result={statusResult} />
        : <ScrollView contentContainerStyle={[modalStyles.content, { paddingBottom: Math.max(insets.bottom + 20, 28) }]} showsVerticalScrollIndicator={false}>
          {statusResult ? <StatusLine tone={statusResult.tone} title={statusResult.title} message={statusResult.message} /> : null}
          <ProjectPublishForm
            accentIcon={accentIcon} addIcon={addIcon} busy={p.busy} category={category} categoryOpen={categoryOpen}
            chevronColor={chevronColor} chipCloseIcon={chipCloseIcon} description={description} generating={p.generating}
            logoImageUrl={logoImageUrl} moreOptionsOpen={moreOptionsOpen} onGenerateAsset={p.onGenerateAsset}
            placeholderColor={placeholderColor} project={p.project} screenshotUrls={screenshotUrls}
            setCategory={(value) => { setCategory(value); setFormDirty(true); }}
            setCategoryOpen={setCategoryOpen}
            setDescription={(value) => { setDescription(value); setFormDirty(true); }}
            setLogoImageUrl={(value) => { setLogoImageUrl(value); setFormDirty(true); }}
            setMoreOptionsOpen={setMoreOptionsOpen}
            setScreenshotUrls={(value) => { setScreenshotUrls(value); setFormDirty(true); }}
            setTagDraft={setTagDraft} setTagInputOpen={setTagInputOpen}
            setTags={(value) => { setTags(value); setFormDirty(true); }}
            setTitle={(value) => { setTitle(value); setFormDirty(true); }}
            setVisibility={(value) => { setVisibilityState(value); setVisibilityChanged(true); setFormDirty(true); }}
            suggestedCategory={suggestedCategory} tagDraft={tagDraft} tagInputOpen={tagInputOpen}
            tags={tags} title={title} visibility={visibility}
          />
          <View style={modalStyles.publishBlock}>
            {p.busy && p.progress ? <StatusLine tone="info" title={p.progress.title} message={p.progress.message} /> : null}
            {p.error ? <StatusLine tone="danger" title="Publishing failed" message={p.error} /> : null}
            {!existingListing || canManageProjectListing(p.publishStatus) ? <PrimaryAction
              busy={p.busy} busyLabel={p.progress?.title || (existingListing ? "Saving" : "Publishing")} disabled={!canSubmit}
              label={existingListing ? "Save listing details" : "Publish to Explore"}
              onPress={() => existingListing ? confirmSave() : p.onPublishRelease(payload())}
            /> : null}
            {existingListing && canPublishProjectRelease(p.publishStatus) ? <Pressable disabled={!canSubmit} onPress={() => p.onPublishRelease(payload())} style={[modalStyles.secondaryAction, !canSubmit ? modalStyles.primaryDisabled : null]}>
              <Ionicons name="cloud-upload-outline" color={accentIcon} size={19} />
              <Text style={modalStyles.secondaryText}>{hasFailedCandidate(p.publishStatus) ? "Fix and resubmit" : "Publish latest version"}</Text>
            </Pressable> : null}
            {existingListing && canDeleteProjectListing(p.publishStatus) ? <Pressable disabled={p.busy} onPress={confirmDelete} style={modalStyles.dangerAction}>
              <Ionicons name="trash-outline" color="#FF9AAD" size={18} /><Text style={modalStyles.dangerActionText}>Delete listing</Text>
            </Pressable> : null}
          </View>
        </ScrollView>}
    </View>
  </Modal>;

  function confirmSave() {
    if (!visibilityChanged || visibility !== "private" || p.publishStatus?.visibility === "private") {
      p.onSaveListing(payload()); return;
    }
    Alert.alert("Make listing private?", "This removes it from Explore and stops its hosted app.", [
      { text: "Cancel", style: "cancel" },
      { text: "Make private", style: "destructive", onPress: () => p.onSaveListing(payload()) }
    ]);
  }

  function confirmDelete() {
    Alert.alert("Delete listing?", "This permanently removes the Explore listing and stops hosting.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete listing", style: "destructive", onPress: p.onDeleteListing }
    ]);
  }
}

function PrimaryAction({ busy, busyLabel, disabled, label, onPress }: { busy: boolean; busyLabel: string; disabled: boolean; label: string; onPress: () => void }) {
  return <Pressable disabled={disabled} style={[modalStyles.primary, disabled ? modalStyles.primaryDisabled : null]} onPress={onPress}>
    <LinearGradient colors={["#7028FF", "#8B35FF", "#6D35FF"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={modalStyles.primaryGradient} />
    {busy ? <ActivityIndicator color={colors.text} size="small" /> : <Ionicons name="checkmark-circle-outline" color={colors.text} size={21} />}
    <Text style={modalStyles.primaryText}>{busy ? busyLabel : label}</Text>
  </Pressable>;
}
