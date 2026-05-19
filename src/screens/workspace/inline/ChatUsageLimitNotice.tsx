import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { chatUsageLimitNotice, getActiveChatUsageLimit, isChatUsageLimitText } from "../../../context/chatUsageLimit";
import { useThemedColor } from "../../../context/PreferencesContext";
import type { ChatMessage } from "../../../types/domain";
import { styles } from "../styles";

export function ChatUsageLimitNotice({ messages }: { messages: ChatMessage[] }) {
  const [dismissedId, setDismissedId] = useState("");
  const warningIcon = useThemedColor("#FFD166");
  const closeIcon = useThemedColor("#BDB5CE");
  const message = messages[messages.length - 1];
  const activeLimit = getActiveChatUsageLimit();
  const messageLimit = message?.role === "assistant"
    && message.runStatus?.status === "failed"
    && isChatUsageLimitText(message.text);
  const notice = activeLimit ?? (messageLimit ? chatUsageLimitNotice(message.text) : null);
  const noticeId = activeLimit ? `${activeLimit.title}:${activeLimit.resetAt ?? activeLimit.body}` : message?.id ?? "";
  if (!notice || noticeId === dismissedId) return null;

  return (
    <View accessibilityRole="alert" style={styles.chatLimitNotice}>
      <View style={styles.chatLimitNoticeIcon}>
        <Ionicons name="warning-outline" color={warningIcon} size={18} />
      </View>
      <View style={styles.chatLimitNoticeCopy}>
        <Text style={styles.chatLimitNoticeTitle}>{notice.title}</Text>
        <Text style={styles.chatLimitNoticeBody}>{notice.body}</Text>
      </View>
      <Pressable accessibilityLabel="Dismiss AI limit warning" onPress={() => setDismissedId(noticeId)} style={styles.chatLimitNoticeDismiss}>
        <Ionicons name="close" color={closeIcon} size={16} />
      </Pressable>
    </View>
  );
}
