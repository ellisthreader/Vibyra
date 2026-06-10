import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ProjectDisplay } from "../types";
import {
  addUniqueTag, PUBLISH_CATEGORIES, VISIBILITY_OPTIONS, type VisibilityKey
} from "./ProjectPublishModal.data";
import { modalStyles } from "./ProjectPublishModal.styles";
import { ProjectPublishIcon } from "./ProjectPublishIcon";
import { ProjectPublishScreenshots } from "./ProjectPublishScreenshots";
import { FieldLabel } from "./ProjectPublishSections";

type Props = {
  accentIcon: string; addIcon: string; busy: boolean; category: string;
  categoryOpen: boolean; chevronColor: string; chipCloseIcon: string;
  description: string; generating?: "logo" | "screenshot" | null;
  logoImageUrl: string; moreOptionsOpen: boolean;
  onGenerateAsset: (kind: "logo" | "screenshot", payload: { description: string; prompt: string; title: string }) => Promise<string | null>;
  placeholderColor: string; project: ProjectDisplay | null;
  screenshotUrls: string[]; setCategory: (value: string) => void;
  setCategoryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setDescription: (value: string) => void; setLogoImageUrl: (value: string) => void;
  setMoreOptionsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setScreenshotUrls: React.Dispatch<React.SetStateAction<string[]>>;
  setTagDraft: (value: string) => void; setTagInputOpen: (value: boolean) => void;
  setTags: React.Dispatch<React.SetStateAction<string[]>>; setTitle: (value: string) => void;
  setVisibility: (value: VisibilityKey) => void; suggestedCategory: string;
  tagDraft: string; tagInputOpen: boolean; tags: string[]; title: string;
  visibility: VisibilityKey;
};

export function ProjectPublishForm(p: Props) {
  const activeVisibility = VISIBILITY_OPTIONS.find((item) => item.key === p.visibility) ?? VISIBILITY_OPTIONS[0];
  return <>
    <View style={[modalStyles.section, modalStyles.firstSection]}>
      <View style={modalStyles.sectionHeader}>
        <Text style={modalStyles.sectionTitle}>Project details</Text>
        <Text style={modalStyles.requiredText}>Required</Text>
      </View>
      <FieldLabel label="Project name" />
      <TextInput editable={!p.busy} onChangeText={p.setTitle} placeholder="Project name" placeholderTextColor={p.placeholderColor} style={[modalStyles.input, modalStyles.titleInput]} value={p.title} />
      <FieldLabel label="Description" />
      <TextInput editable={!p.busy} multiline onChangeText={p.setDescription} placeholder="Describe what this project does" placeholderTextColor={p.placeholderColor} style={[modalStyles.input, modalStyles.textarea]} value={p.description} />
    </View>
    <View style={modalStyles.section}>
      <View style={modalStyles.sectionHeader}>
        <Text style={modalStyles.sectionTitle}>Visibility</Text>
        <Text style={modalStyles.sectionMeta}>{activeVisibility.title}</Text>
      </View>
      <View style={modalStyles.visibilitySegment}>
        {VISIBILITY_OPTIONS.map((option) => {
          const active = p.visibility === option.key;
          return <Pressable key={option.key} disabled={p.busy} onPress={() => p.setVisibility(option.key)} style={[modalStyles.visibilitySegmentOption, active ? modalStyles.visibilitySegmentOptionActive : null]}>
            <Ionicons name={option.icon} color={active ? p.accentIcon : p.chevronColor} size={17} />
            <Text style={[modalStyles.visibilitySegmentText, active ? modalStyles.visibilitySegmentTextActive : null]}>{option.title}</Text>
          </Pressable>;
        })}
      </View>
      <Text style={modalStyles.visibilityCopy}>{activeVisibility.copy}</Text>
    </View>
    <View style={modalStyles.section}>
      <Pressable disabled={p.busy} onPress={() => p.setMoreOptionsOpen((value) => !value)} style={modalStyles.moreOptionsRow}>
        <View style={modalStyles.moreOptionsCopy}>
          <Text style={modalStyles.moreOptionsTitle}>More options</Text>
          <Text style={modalStyles.moreOptionsText}>Photos, category, tags, and app icon</Text>
        </View>
        <Ionicons name={p.moreOptionsOpen ? "chevron-up" : "chevron-down"} color={p.chevronColor} size={20} />
      </Pressable>
      {p.moreOptionsOpen ? <View style={modalStyles.moreOptionsPanel}>
        <View style={modalStyles.nestedSection}>
          <View style={modalStyles.sectionHeader}><Text style={modalStyles.sectionTitle}>Photos</Text><Text style={modalStyles.sectionMeta}>{p.screenshotUrls.length}/4</Text></View>
          <ProjectPublishScreenshots busy={p.busy} description={p.description} generating={p.generating === "screenshot"} onGenerateAsset={p.onGenerateAsset} project={p.project} setUrls={p.setScreenshotUrls} title={p.title} urls={p.screenshotUrls} />
        </View>
        <View style={modalStyles.nestedSection}>
          <View style={modalStyles.sectionHeader}><Text style={modalStyles.sectionTitle}>Discovery</Text><Text style={modalStyles.sectionMeta}>AI suggested</Text></View>
          <FieldLabel label="Primary category" />
          <Pressable disabled={p.busy} onPress={() => p.setCategoryOpen((value) => !value)} style={modalStyles.select}>
            <View style={modalStyles.selectValueRow}><Text style={modalStyles.selectText}>{p.category}</Text>{p.category === p.suggestedCategory ? <Text style={modalStyles.suggestedPill}>Suggested</Text> : null}</View>
            <Ionicons name={p.categoryOpen ? "chevron-up" : "chevron-down"} color={p.chevronColor} size={20} />
          </Pressable>
          {p.categoryOpen ? <View style={modalStyles.categoryMenu}>{PUBLISH_CATEGORIES.map((item) =>
            <Pressable key={item} disabled={p.busy} onPress={() => { p.setCategory(item); p.setCategoryOpen(false); }} style={modalStyles.categoryOption}>
              <View style={modalStyles.categoryOptionCopy}><Text style={[modalStyles.categoryText, item === p.category ? modalStyles.categoryTextActive : null]}>{item}</Text>{item === p.suggestedCategory ? <Text style={modalStyles.categorySuggestedText}>Suggested</Text> : null}</View>
              {item === p.category ? <Ionicons name="checkmark" color={p.accentIcon} size={17} /> : null}
            </Pressable>)}</View> : null}
          <FieldLabel label="Tags" />
          <View style={modalStyles.tagsRow}>
            {p.tags.map((tag) => <View key={tag} style={modalStyles.tagChip}><Text style={modalStyles.tagText}>{tag}</Text><Pressable disabled={p.busy} onPress={() => p.setTags((items) => items.filter((item) => item !== tag))}><Ionicons name="close" color={p.chipCloseIcon} size={15} /></Pressable></View>)}
            {p.tagInputOpen ? <View style={modalStyles.tagInputWrap}><TextInput autoFocus editable={!p.busy} onChangeText={p.setTagDraft} onSubmitEditing={addTag} placeholder="Tag" placeholderTextColor={p.placeholderColor} style={modalStyles.tagInput} value={p.tagDraft} /><Pressable disabled={p.busy || !p.tagDraft.trim()} onPress={addTag}><Ionicons name="checkmark" color={p.accentIcon} size={18} /></Pressable></View>
              : <Pressable disabled={p.busy || p.tags.length >= 8} onPress={() => p.setTagInputOpen(true)} style={modalStyles.addTag}><Ionicons name="add" color={p.addIcon} size={18} /><Text style={modalStyles.addTagText}>Add tag</Text></Pressable>}
          </View>
        </View>
        <View style={modalStyles.nestedSectionLast}>
          <View style={modalStyles.sectionHeader}><Text style={modalStyles.sectionTitle}>App icon</Text><Text style={modalStyles.sectionMeta}>Optional</Text></View>
          <ProjectPublishIcon busy={p.busy} description={p.description} generating={p.generating === "logo"} imageUrl={p.logoImageUrl} onGenerateAsset={p.onGenerateAsset} setImageUrl={p.setLogoImageUrl} title={p.title} />
        </View>
      </View> : null}
    </View>
  </>;

  function addTag() {
    p.setTags((current) => addUniqueTag(current, p.tagDraft));
    p.setTagDraft("");
    p.setTagInputOpen(false);
  }
}
