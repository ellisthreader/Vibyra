import React from "react";
import { Text } from "react-native";
import { usePreferences, type NotificationPreferenceKey } from "../../../../context/PreferencesContext";
import { styles } from "../../styles";
import { ProfileSheet } from "./ProfileSheet";
import { ToggleRow } from "./ToggleRow";

export function NotificationsSheet({ visible, onClose }: {
  visible: boolean;
  onClose: () => void;
}) {
  const prefs = usePreferences();
  const setPreference = (key: NotificationPreferenceKey) => (value: boolean) => prefs.setNotificationPreference(key, value);

  return (
    <ProfileSheet visible={visible} onClose={onClose} icon="notifications-outline" kicker="Preferences" title="Notifications">
      <Text style={styles.profileSheetText}>Choose which updates Vibyra should surface while you work.</Text>
      <ToggleRow
        icon="construct-outline"
        onChange={setPreference("buildUpdates")}
        subtitle="Agent starts, completions, failures, and queued build changes."
        title="Build updates"
        value={prefs.notifications.buildUpdates}
      />
      <ToggleRow
        icon="chatbubble-ellipses-outline"
        onChange={setPreference("chatReplies")}
        subtitle="New assistant replies and important chat activity."
        title="Chat replies"
        value={prefs.notifications.chatReplies}
      />
      <ToggleRow
        icon="sparkles-outline"
        onChange={setPreference("productUpdates")}
        subtitle="Occasional Vibyra feature, credit, and membership updates."
        title="Product updates"
        value={prefs.notifications.productUpdates}
      />
      <Text style={styles.profileSheetMuted}>System-level notification permissions are still controlled by your device settings.</Text>
    </ProfileSheet>
  );
}
