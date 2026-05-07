import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useAppContext } from "../../../context/AppContext";
import { colors } from "../../../styles/theme";
import { RememberedDesktop } from "../../../types/domain";
import { ConnectStep } from "../components/ConnectStep";
import { WaitingApprovalIndicator } from "../components/WaitingApprovalIndicator";
import { styles } from "../styles";

function statusLabel(status: RememberedDesktop["status"]) {
  if (status === "current") return "Connected now";
  if (status === "online") return "Available nearby";
  if (status === "checking") return "Checking activity...";
  return "Remembered, not reachable";
}

function statusStyle(status: RememberedDesktop["status"]) {
  if (status === "current") return styles.desktopResultStatusCurrent;
  if (status === "online") return styles.desktopResultStatusOnline;
  if (status === "checking") return styles.desktopResultStatusChecking;
  return styles.desktopResultStatusOffline;
}

export function ConnectStepTwo({
  connectMode,
  setConnectMode,
  foundDesktops,
  findDesktops
}: {
  connectMode: "auto" | "manual";
  setConnectMode: (mode: "auto" | "manual") => void;
  foundDesktops: RememberedDesktop[];
  findDesktops: () => Promise<void>;
}) {
  const app = useAppContext();

  return (
    <ConnectStep number={2} icon="phone-portrait-outline" title="Choose how to connect">
      <View style={styles.connectActionStack}>
        <View style={styles.connectModeTabs}>
          <Pressable style={[styles.connectModeTab, connectMode === "auto" ? styles.connectModeTabActive : null]} onPress={() => setConnectMode("auto")}>
            <Ionicons name="wifi-outline" color={connectMode === "auto" ? colors.text : colors.muted} size={15} />
            <Text style={[styles.connectModeText, connectMode === "auto" ? styles.connectModeTextActive : null]}>Auto Find</Text>
          </Pressable>
          <Pressable style={[styles.connectModeTab, connectMode === "manual" ? styles.connectModeTabActive : null]} onPress={() => setConnectMode("manual")}>
            <Ionicons name="keypad-outline" color={connectMode === "manual" ? colors.text : colors.muted} size={15} />
            <Text style={[styles.connectModeText, connectMode === "manual" ? styles.connectModeTextActive : null]}>Manual</Text>
          </Pressable>
        </View>

        {connectMode === "auto" ? (
          <View style={styles.connectSimplePane}>
            <Pressable
              disabled={app.checkingHealth}
              style={({ pressed }) => [
                styles.connectPrimaryAction,
                pressed && !app.checkingHealth ? styles.connectActionPressed : null,
                app.checkingHealth ? styles.connectActionDisabled : null
              ]}
              onPress={findDesktops}
            >
              <LinearGradient colors={["#762CFF", "#9D35FF", "#B13CFF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.connectPrimaryActionGradient}>
                <Ionicons name="search-outline" color={colors.text} size={27} />
                <View style={styles.connectActionCopy}>
                  <Text style={styles.connectActionTitle}>{app.checkingHealth ? "Searching nearby PCs..." : foundDesktops.length > 0 ? "Search again" : "Auto Find My PC"}</Text>
                  <Text style={styles.connectActionMeta}>Starts automatically on same Wi-Fi.</Text>
                </View>
              </LinearGradient>
            </Pressable>

            {foundDesktops.length > 0 ? (
              <View style={styles.desktopList}>
                {foundDesktops.map((desktop) => (
                  <Pressable
                    key={desktop.url}
                    style={({ pressed }) => [styles.desktopResult, pressed ? styles.connectActionPressed : null]}
                    onPress={() => app.pairMachineAt(desktop.url, desktop.pairCode)}
                  >
                    <Ionicons name="desktop-outline" color="#8AF7FF" size={18} />
                    <View style={styles.connectActionCopy}>
                      <Text style={styles.desktopResultTitle}>{desktop.machineName}</Text>
                      <View style={styles.desktopResultMetaRow}>
                        <View style={[styles.desktopResultStatusDot, statusStyle(desktop.status)]} />
                        <Text style={styles.desktopResultMeta}>{statusLabel(desktop.status)}</Text>
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.connectSimplePane}>
            <Text style={styles.connectCodeLabel}>Manual code</Text>
            <TextInput
              value={app.pairCode}
              onChangeText={(value) => app.setPairCode(value.toUpperCase())}
              placeholder="ABC123"
              placeholderTextColor={colors.dim}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              onSubmitEditing={app.pairMachine}
              returnKeyType="done"
              style={[styles.input, styles.connectCodeInput]}
            />
            <Text style={styles.connectOrText}>Use the 2 codes shown on phone and desktop</Text>
            <Pressable style={({ pressed }) => [styles.connectSecondaryAction, pressed ? styles.connectActionPressed : null]} onPress={app.pairMachine}>
              <Ionicons name="link-outline" color={colors.text} size={18} />
              <Text style={styles.connectSecondaryActionText}>{app.pairing ? "Connecting..." : "Connect manually"}</Text>
            </Pressable>
          </View>
        )}
        {app.pairing && !app.pendingPhoneApproval ? <WaitingApprovalIndicator message="Awaiting approval from PC application" /> : null}
        {app.healthMessage ? <Text style={styles.connectStatus}>{app.healthMessage}</Text> : null}
        {app.pairingError ? <Text style={styles.errorText}>{app.pairingError}</Text> : null}
      </View>
    </ConnectStep>
  );
}
