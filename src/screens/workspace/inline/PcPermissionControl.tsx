import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppContext } from "../../../context/AppContext";
import { usePreferences, useThemedColor } from "../../../context/PreferencesContext";
import type { DesktopPermissionMode } from "../../../types/domain";
import { PcPermissionUsageLimits } from "./PcPermissionUsageLimits";

type PermissionOption = {
  key: "ask" | "folder" | "full";
  label: string;
  trigger: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const OPTIONS: PermissionOption[] = [
  { key: "ask", label: "Review First", trigger: "Review First", detail: "Approve edits before files change", icon: "shield-checkmark-outline" },
  { key: "folder", label: "Auto-Approve in This Folder", trigger: "Folder Auto-Approve", detail: "Only this project can apply edits", icon: "folder-open-outline" },
  { key: "full", label: "Full Access", trigger: "Full Access", detail: "Apply edits in this folder", icon: "lock-open-outline" }
];

export function PcPermissionControl({ onOpenConnect, projectId }: { onOpenConnect: () => void; projectId?: string }) {
  const app = useAppContext();
  const prefs = usePreferences();
  const [open, setOpen] = useState(false);
  const [confirmFullAccessOpen, setConfirmFullAccessOpen] = useState(false);
  const connected = Boolean(app.connection);
  const palette = prefs.effectiveScheme === "light" ? lightPalette : darkPalette;
  const iconColor = useThemedColor(connected ? "#D7C4FF" : "#9E98B1");
  const activeKey = projectId && app.editApprovals[projectId] === "always" ? "folder" : "ask";
  const activeMode = OPTIONS.find((item) => item.key === activeKey) ?? OPTIONS[0];

  useEffect(() => {
    if (!connected) setOpen(false);
  }, [connected]);

  function handlePress() {
    if (!connected) {
      onOpenConnect();
      return;
    }
    setOpen((value) => !value);
  }

  function selectMode(key: PermissionOption["key"]) {
    if (key === "full") {
      setOpen(false);
      setConfirmFullAccessOpen(true);
      return;
    }
    const nextMode: DesktopPermissionMode = key === "folder" ? "auto" : "ask";
    app.setDesktopPermissionMode(nextMode, projectId);
    setOpen(false);
  }

  function confirmFullAccess() {
    if (projectId) app.setDesktopPermissionMode("auto", projectId);
    setConfirmFullAccessOpen(false);
  }

  return (
    <View style={localStyles.shell}>
      {open ? (
        <View style={[localStyles.menu, { backgroundColor: palette.menu, borderColor: palette.border }]}>
          {OPTIONS.map((item) => {
            const active = item.key === activeKey;
            const disabled = (item.key === "folder" || item.key === "full") && !projectId;
            return (
              <Pressable
                disabled={disabled}
                key={item.key}
                onPress={() => selectMode(item.key)}
                style={[localStyles.row, active ? { backgroundColor: palette.active } : null, disabled ? localStyles.disabled : null]}
              >
                <Ionicons name={item.icon} color={active ? palette.text : palette.muted} size={16} />
                <View style={localStyles.rowCopy}>
                  <Text style={[localStyles.rowLabel, { color: palette.text }]}>{item.label}</Text>
                  <Text style={[localStyles.rowDetail, { color: palette.muted }]}>{disabled ? "Select a folder first" : item.detail}</Text>
                </View>
                {active ? <Ionicons name="checkmark" color={palette.text} size={16} /> : null}
              </Pressable>
            );
          })}
          <PcPermissionUsageLimits />
        </View>
      ) : null}
      <Pressable accessibilityLabel={connected ? "Change PC permission mode" : "Connect PC"} onPress={handlePress} style={({ pressed }) => [localStyles.trigger, pressed && localStyles.pressed]}>
        <Ionicons name="desktop-outline" color={iconColor} size={18} />
        <Text numberOfLines={1} style={[localStyles.label, { color: connected ? palette.text : palette.muted }]}>
          {connected ? activeMode.trigger : "Connect PC"}
        </Text>
      </Pressable>
      <Modal animationType="fade" transparent visible={confirmFullAccessOpen} onRequestClose={() => setConfirmFullAccessOpen(false)}>
        <View style={localStyles.modalOverlay}>
          <View style={[localStyles.modalCard, { backgroundColor: palette.menu, borderColor: palette.border }]}>
            <View style={[localStyles.modalIcon, { backgroundColor: palette.active }]}>
              <Ionicons name="lock-open-outline" color={palette.text} size={18} />
            </View>
            <Text style={[localStyles.modalTitle, { color: palette.text }]}>Enable Full Access?</Text>
            <Text style={[localStyles.modalBody, { color: palette.muted }]}>
              Vibyra can apply edits in this folder without asking each time. Use this only for folders you trust.
            </Text>
            <View style={localStyles.modalActions}>
              <Pressable accessibilityLabel="Cancel full access" onPress={() => setConfirmFullAccessOpen(false)} style={({ pressed }) => [localStyles.modalButton, { borderColor: palette.border }, pressed && localStyles.pressed]}>
                <Text style={[localStyles.modalCancelText, { color: palette.text }]}>Cancel</Text>
              </Pressable>
              <Pressable accessibilityLabel="Enable full access" onPress={confirmFullAccess} style={({ pressed }) => [localStyles.modalButton, localStyles.modalConfirmButton, pressed && localStyles.pressed]}>
                <Text style={localStyles.modalConfirmText}>Enable Full Access</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const localStyles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: "800", letterSpacing: 0, lineHeight: 16 },
  menu: {
    borderRadius: 14,
    borderWidth: 1,
    bottom: 38,
    gap: 2,
    left: 0,
    minWidth: 268,
    padding: 6,
    position: "absolute",
    zIndex: 30
  },
  pressed: { opacity: 0.74, transform: [{ scale: 0.96 }] },
  disabled: { opacity: 0.46 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  modalBody: { fontSize: 13, fontWeight: "700", lineHeight: 18, textAlign: "center" },
  modalButton: { alignItems: "center", borderRadius: 10, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 42, paddingHorizontal: 10 },
  modalCancelText: { fontSize: 13, fontWeight: "900", lineHeight: 17 },
  modalCard: { alignItems: "center", borderRadius: 16, borderWidth: 1, maxWidth: 324, padding: 18, width: "86%" },
  modalConfirmButton: { backgroundColor: "#7C3AED", borderColor: "#7C3AED" },
  modalConfirmText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900", lineHeight: 17, textAlign: "center" },
  modalIcon: { alignItems: "center", borderRadius: 18, height: 36, justifyContent: "center", marginBottom: 10, width: 36 },
  modalOverlay: { alignItems: "center", backgroundColor: "rgba(0, 0, 0, 0.52)", flex: 1, justifyContent: "center", padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: "900", lineHeight: 23, marginBottom: 7, textAlign: "center" },
  row: { alignItems: "center", borderRadius: 10, flexDirection: "row", gap: 9, minHeight: 42, paddingHorizontal: 9, paddingVertical: 7 },
  rowCopy: { flex: 1, minWidth: 0 },
  rowDetail: { fontSize: 11, fontWeight: "700", lineHeight: 15 },
  rowLabel: { fontSize: 12.5, fontWeight: "900", lineHeight: 16 },
  shell: { alignItems: "flex-start", marginTop: 4, position: "relative", zIndex: 20 },
  trigger: { alignItems: "center", flexDirection: "row", gap: 7, minHeight: 32, minWidth: 0, padding: 2 }
});

const darkPalette = {
  active: "rgba(176, 132, 255, 0.16)",
  border: "rgba(176, 132, 255, 0.24)",
  menu: "#13131F",
  muted: "#A9A3BA",
  text: "#EAE6F8"
};

const lightPalette = {
  active: "rgba(109, 59, 255, 0.12)",
  border: "rgba(109, 59, 255, 0.16)",
  menu: "#FFFFFF",
  muted: "#6B647C",
  text: "#312A46"
};
