import React from "react";
import { ProfileSheet } from "./ProfileSheet";
import { ToggleRow } from "./ToggleRow";
import { ProfileSheets } from "./useProfileSheets";

export function NotificationsSheet({ visible, onClose, sheets }: {
  visible: boolean;
  onClose: () => void;
  sheets: ProfileSheets;
}) {
  return (
    <ProfileSheet visible={visible} onClose={onClose} icon="notifications-outline" kicker="Preferences" title="Notifications">
      <ToggleRow icon="phone-portrait-outline" title="Push notifications" subtitle="Build progress, agent results, mentions"
        value={sheets.pushNotifications} onChange={sheets.setPushNotifications} />
      <ToggleRow icon="mail-outline" title="Email digests" subtitle="Weekly summary of your projects"
        value={sheets.emailNotifications} onChange={sheets.setEmailNotifications} />
      <ToggleRow icon="flash-outline" title="Agent alerts" subtitle="Ping me when an agent needs input"
        value={sheets.agentNotifications} onChange={sheets.setAgentNotifications} />
    </ProfileSheet>
  );
}
