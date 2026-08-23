import React, { useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import { reportCommunityProject, type CommunityReportReason } from "../../../utils/communityApi";
import { styles } from "../styles";
import type { CommunityPost } from "../types";

type ReportReason = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: CommunityReportReason;
};

const reasons: ReportReason[] = [
  { icon: "alert-circle-outline", label: "Broken app", value: "broken_app" },
  { icon: "shield-outline", label: "Unsafe content", value: "unsafe_content" },
  { icon: "ban-outline", label: "Spam or scam", value: "spam_or_scam" },
  { icon: "ellipsis-horizontal", label: "Other", value: "other" }
];
const MAX_SCREENSHOT_DATA_URL_CHARACTERS = 2_800_000;

export function CommunityReportModal({ authToken, post, visible, onClose }: {
  authToken: string;
  post: CommunityPost | null;
  visible: boolean;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<CommunityReportReason>(reasons[0].value);
  const [comment, setComment] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function close() {
    setReason(reasons[0].value);
    setComment("");
    setScreenshot(null);
    setError("");
    setSent(false);
    setSubmitting(false);
    onClose();
  }

  async function attachScreenshot() {
    setError("");
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { setError("Allow photo access to attach a screenshot."); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, base64: true, mediaTypes: ["images"], quality: 0.82 });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.base64) { setError("That screenshot could not be attached."); return; }
      const dataUrl = `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`;
      if (dataUrl.length > MAX_SCREENSHOT_DATA_URL_CHARACTERS) {
        setError("Choose a screenshot smaller than 2 MB.");
        return;
      }
      setScreenshot(dataUrl);
    } catch {
      setError("That screenshot could not be attached.");
    }
  }

  async function submit() {
    if (!post) return;
    if (!authToken) { setError("Log in before reporting an app."); return; }
    setError("");
    setSubmitting(true);
    try {
      await reportCommunityProject(authToken, post.id, {
        details: comment.trim(), reason, screenshot,
      });
      setSent(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The report could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={() => { if (!submitting) close(); }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.communityReportBackdrop}>
        <Pressable disabled={submitting} style={styles.communityReportScrim} onPress={close} />
        <View style={styles.communityReportSheet}>
          <View style={styles.communityReportHeader}>
            <View style={styles.communityReportIconBubble}>
              <Ionicons name="flag-outline" color="#FDF7FF" size={20} />
            </View>
            <View style={styles.communityReportHeaderCopy}>
              <Text style={styles.communityReportTitle}>Report this app</Text>
              <Text numberOfLines={1} style={styles.communityReportSubtitle}>{post?.title || "Community app"}</Text>
            </View>
            <Pressable accessibilityLabel="Close report" disabled={submitting} onPress={close} style={styles.communityReportClose}>
              <Ionicons name="close" color="#CFC8DA" size={18} />
            </Pressable>
          </View>
          {sent ? (
            <View style={styles.communityReportSent}>
              <View style={styles.communityReportSentIcon}>
                <Ionicons name="checkmark" color="#092414" size={22} />
              </View>
              <Text style={styles.communityReportSentTitle}>Report submitted</Text>
              <Text style={styles.communityReportSentText}>Thanks. We will review it soon.</Text>
              <Pressable onPress={close} style={styles.communityReportPrimary}><Text style={styles.communityReportPrimaryText}>Done</Text></Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.communityReportSectionLabel}>What is wrong?</Text>
              <View style={styles.communityReportReasons}>
                {reasons.map((item) => {
                  const active = reason === item.value;
                  return (
                    <Pressable key={item.value} onPress={() => setReason(item.value)} style={[styles.communityReportReason, active ? styles.communityReportReasonActive : null]}>
                      <View style={styles.communityReportReasonLeft}>
                        <Ionicons name={item.icon} color={active ? "#FFFFFF" : "#AEA7BA"} size={18} />
                        <Text style={[styles.communityReportReasonText, active ? styles.communityReportReasonTextActive : null]}>{item.label}</Text>
                      </View>
                      {active ? <Ionicons name="checkmark-circle" color="#B7FBD0" size={18} /> : null}
                    </Pressable>
                  );
                })}
              </View>
              <TextInput maxLength={1000} multiline placeholder="Add a short note, optional" placeholderTextColor="#747C8A" style={styles.communityReportInput} value={comment} onChangeText={setComment} />
              {screenshot ? (
                <View style={styles.communityReportScreenshotRow}>
                  <Image source={{ uri: screenshot }} style={styles.communityReportScreenshot} />
                  <Text numberOfLines={1} style={styles.communityReportScreenshotText}>Screenshot attached</Text>
                  <Pressable accessibilityLabel="Remove screenshot" onPress={() => setScreenshot(null)} style={styles.communityReportRemoveShot}>
                    <Ionicons name="close" color="#FFB4C1" size={16} />
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={attachScreenshot} style={styles.communityReportAttach}>
                  <Ionicons name="image-outline" color="#A6ADBA" size={18} />
                  <Text style={styles.communityReportAttachText}>Add screenshot</Text>
                </Pressable>
              )}
              {error ? <Text style={styles.communityReportError}>{error}</Text> : null}
              <View style={styles.communityReportFooter}>
                <Pressable disabled={submitting} onPress={close} style={styles.communityReportSecondary}><Text style={styles.communityReportSecondaryText}>Cancel</Text></Pressable>
                <Pressable disabled={submitting} onPress={() => { void submit(); }} style={[styles.communityReportPrimary, submitting ? { opacity: 0.65 } : null]}>
                  {submitting ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.communityReportPrimaryText}>Submit</Text>}
                </Pressable>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
