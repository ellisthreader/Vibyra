import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { styles } from "../../styles";
import { usePreferences } from "../../../../context/PreferencesContext";
import type { SettingsTab } from "../../types";
import { ProfileSettingsGroup } from "../index";
import { ProfileHero } from "./ProfileHero";
import { EditProfileSheet } from "./EditProfileSheet";
import { BillingSheet } from "./BillingSheet";
import { UsageSheet } from "./UsageSheet";
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
  const { t } = usePreferences();
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
        onOpenBilling={() => sheets.open("billing")}
      />

      <ProfileSettingsGroup
        activeLabel={selectedRow}
        onSelect={selectRow}
        title={t("profile.account")}
        rows={[
          { key: "Profile information", icon: "person-outline", label: t("profile.row.profileInformation") },
          { key: "Billing & subscription", icon: "card-outline", label: t("profile.row.billing") },
          { key: "Usage & history", icon: "time-outline", label: t("profile.row.usage") }
        ]}
      />

      <ProfileSettingsGroup
        activeLabel={selectedRow}
        onSelect={selectRow}
        title={t("profile.preferences")}
        rows={[
          { key: "Notifications", icon: "notifications-outline", label: t("profile.row.notifications") },
          { key: "Appearance", icon: "color-palette-outline", label: t("profile.row.appearance"), value: appearanceLabel(sheets.appearance) },
          { key: "Privacy & security", icon: "shield-outline", label: t("profile.row.security") },
          { key: "Language", icon: "globe-outline", label: t("profile.row.language"), value: sheets.language }
        ]}
      />

      <ProfileSettingsGroup
        activeLabel={selectedRow}
        onSelect={selectRow}
        title={t("profile.support")}
        rows={[
          { key: "Help center", icon: "help-circle-outline", label: t("profile.row.help") },
          { key: "Contact support", icon: "chatbubble-outline", label: t("profile.row.contact") },
          { key: "Terms of service", icon: "document-text-outline", label: t("profile.row.terms") },
          { key: "Log out", danger: true, icon: "log-out-outline", label: t("profile.row.logout") }
        ]}
      />

      <EditProfileSheet visible={sheets.isOpen("edit")} onClose={sheets.close} />
      <BillingSheet visible={sheets.isOpen("billing")} onClose={sheets.close} />
      <UsageSheet visible={sheets.isOpen("usage")} onClose={sheets.close} onUpgrade={() => sheets.open("billing")} />
      <NotificationsSheet visible={sheets.isOpen("notifications")} onClose={sheets.close} />
      <AppearanceSheet visible={sheets.isOpen("appearance")} onClose={sheets.close} sheets={sheets} />
      <SecuritySheet visible={sheets.isOpen("security")} onClose={sheets.close} />
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
