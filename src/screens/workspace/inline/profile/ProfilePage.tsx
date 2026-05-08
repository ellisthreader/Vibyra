import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { styles } from "../../styles";
import type { SettingsTab } from "../../types";
import { ProfileSettingsGroup } from "../index";
import { ProfileHero } from "./ProfileHero";
import { EditProfileSheet } from "./EditProfileSheet";
import { BillingSheet } from "./BillingSheet";
import { UsageSheet } from "./UsageSheet";
import { ReferSheet } from "./ReferSheet";
import { NotificationsSheet } from "./NotificationsSheet";
import { AppearanceSheet } from "./AppearanceSheet";
import { SecuritySheet } from "./SecuritySheet";
import { LanguageSheet } from "./LanguageSheet";
import { HelpSheet } from "./HelpSheet";
import { SupportSheet } from "./SupportSheet";
import { TermsSheet } from "./TermsSheet";
import { LogoutSheet } from "./LogoutSheet";
import { useProfileSheets } from "./useProfileSheets";
import { PROFILE_ROW_TO_SHEET, appearanceLabel } from "./types";

export function ProfilePage({ activeTab, onTabChange }: {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}) {
  const sheets = useProfileSheets();
  const [selectedRow, setSelectedRow] = useState(getProfileRowForTab(activeTab));

  useEffect(() => { setSelectedRow(getProfileRowForTab(activeTab)); }, [activeTab]);

  const selectRow = useCallback((label: string) => {
    setSelectedRow(label);
    const tab = getProfileTabForRow(label);
    if (tab) onTabChange(tab);
    const kind = PROFILE_ROW_TO_SHEET[label];
    if (kind) sheets.open(kind);
  }, [onTabChange, sheets]);

  return (
    <View style={styles.profileScreen}>
      <ProfileHero
        onEdit={() => sheets.open("edit")}
        onOpenBilling={() => sheets.open("billing")}
        onOpenUsage={() => sheets.open("usage")}
      />

      <ProfileSettingsGroup
        activeLabel={selectedRow}
        onSelect={selectRow}
        title="ACCOUNT"
        rows={[
          { icon: "person-outline", label: "Profile information" },
          { icon: "card-outline", label: "Billing & subscription" },
          { icon: "time-outline", label: "Usage & history" },
          { icon: "gift-outline", label: "Refer & earn" }
        ]}
      />

      <ProfileSettingsGroup
        activeLabel={selectedRow}
        onSelect={selectRow}
        title="PREFERENCES"
        rows={[
          { icon: "notifications-outline", label: "Notifications" },
          { icon: "color-palette-outline", label: "Appearance", value: appearanceLabel(sheets.appearance) },
          { icon: "shield-outline", label: "Privacy & security" },
          { icon: "globe-outline", label: "Language", value: sheets.language }
        ]}
      />

      <ProfileSettingsGroup
        activeLabel={selectedRow}
        onSelect={selectRow}
        title="SUPPORT"
        rows={[
          { icon: "help-circle-outline", label: "Help center" },
          { icon: "chatbubble-outline", label: "Contact support" },
          { icon: "document-text-outline", label: "Terms of service" },
          { danger: true, icon: "log-out-outline", label: "Log out" }
        ]}
      />

      <EditProfileSheet visible={sheets.isOpen("edit")} onClose={sheets.close} />
      <BillingSheet visible={sheets.isOpen("billing")} onClose={sheets.close} />
      <UsageSheet visible={sheets.isOpen("usage")} onClose={sheets.close} onUpgrade={() => sheets.open("billing")} />
      <ReferSheet visible={sheets.isOpen("refer")} onClose={sheets.close} />
      <NotificationsSheet visible={sheets.isOpen("notifications")} onClose={sheets.close} sheets={sheets} />
      <AppearanceSheet visible={sheets.isOpen("appearance")} onClose={sheets.close} sheets={sheets} />
      <SecuritySheet visible={sheets.isOpen("security")} onClose={sheets.close} sheets={sheets} onSignOutAll={() => sheets.open("logout")} />
      <LanguageSheet visible={sheets.isOpen("language")} onClose={sheets.close} sheets={sheets} />
      <HelpSheet visible={sheets.isOpen("help")} onClose={sheets.close} onOpenSupport={() => sheets.open("support")} />
      <SupportSheet visible={sheets.isOpen("support")} onClose={sheets.close} />
      <TermsSheet visible={sheets.isOpen("terms")} onClose={sheets.close} />
      <LogoutSheet visible={sheets.isOpen("logout")} onCancel={sheets.close} />
    </View>
  );
}

export function getProfileRowForTab(tab: SettingsTab) {
  if (tab === "billing") return "Billing & subscription";
  if (tab === "preferences") return "Appearance";
  if (tab === "security") return "Privacy & security";
  return "Profile information";
}

export function getProfileTabForRow(label: string): SettingsTab | null {
  if (label === "Profile information") return "profile";
  if (label === "Billing & subscription" || label === "Usage & history") return "billing";
  if (label === "Notifications" || label === "Appearance" || label === "Language") return "preferences";
  if (label === "Privacy & security") return "security";
  return null;
}
