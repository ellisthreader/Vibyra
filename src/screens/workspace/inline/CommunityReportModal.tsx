import React, { useState } from "react";
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { styles } from "../styles";
import type { CommunityPost } from "../types";

type ReportReason = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
};

const reasons: ReportReason[] = [
  { icon: "alert-circle-outline", label: "Broken app" },
  { icon: "shield-outline", label: "Unsafe content" },
  { icon: "ban-outline", label: "Spam or scam" },
  { icon: "ellipsis-horizontal", label: "Other" }
];

export function CommunityReportModal({ post, visible, onClose }: {
  post: CommunityPost | null;
  visible: boolean;
  onClose: () => void;
}) {
  const [reason, setReason] = useState(reasons[0].label);
  const [comment, setComment] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  function close() {
    setReason(reasons[0].label);
    setComment("");
    setScreenshot(null);
    setError("");
    setSent(false);
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
      setScreenshot(`data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`);
    } catch {
      setError("That screenshot could not be attached.");
    }
  }

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.communityReportBackdrop}>
        <Pressable style={styles.communityReportScrim} onPress={close} />
        <View style={styles.communityReportSheet}>
          <View style={styles.communityReportHeader}>
            <View style={styles.communityReportIconBubble}>
              <Ionicons name="flag-outline" color="#FDF7FF" size={20} />
            </View>
            <View style={styles.communityReportHeaderCopy}>
              <Text style={styles.communityReportTitle}>Report this app</Text>
              <Text numberOfLines={1} style={styles.communityReportSubtitle}>{post?.title || "Community app"}</Text>
            </View>
            <Pressable accessibilityLabel="Close report" onPress={close} style={styles.communityReportClose}>
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
                  const active = reason === item.label;
                  return (
                    <Pressable key={item.label} onPress={() => setReason(item.label)} style={[styles.communityReportReason, active ? styles.communityReportReasonActive : null]}>
                      <View style={styles.communityReportReasonLeft}>
                        <Ionicons name={item.icon} color={active ? "#FFFFFF" : "#AEA7BA"} size={18} />
                        <Text style={[styles.communityReportReasonText, active ? styles.communityReportReasonTextActive : null]}>{item.label}</Text>
                      </View>
                      {active ? <Ionicons name="checkmark-circle" color="#B7FBD0" size={18} /> : null}
                    </Pressable>
                  );
                })}
              </View>
              <TextInput multiline placeholder="Add a short note, optional" placeholderTextColor="#8F8A9E" style={styles.communityReportInput} value={comment} onChangeText={setComment} />
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
                  <Ionicons name="image-outline" color="#D8D3E4" size={18} />
                  <Text style={styles.communityReportAttachText}>Add screenshot</Text>
                </Pressable>
              )}
              {error ? <Text style={styles.communityReportError}>{error}</Text> : null}
              <View style={styles.communityReportFooter}>
                <Pressable onPress={close} style={styles.communityReportSecondary}><Text style={styles.communityReportSecondaryText}>Cancel</Text></Pressable>
                <Pressable onPress={() => setSent(true)} style={styles.communityReportPrimary}><Text style={styles.communityReportPrimaryText}>Submit</Text></Pressable>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
