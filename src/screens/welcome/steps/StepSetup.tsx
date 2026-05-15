import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, Text, TextInput, View } from "react-native";
import { useAppContext } from "../../../context/AppContext";
import { colors } from "../../../styles/theme";
import { RememberedDesktop } from "../../../types/domain";
import { PrimaryButton } from "../components/PrimaryButton";
import { RadarPulse } from "../components/RadarPulse";
import { SkipPill } from "../components/SkipPill";
import { welcomeCopy } from "../data/welcomeCopy";
import { useEntrance } from "../hooks/useEntrance";
import { WelcomeFlow } from "../types";
import { styles } from "../styles";

export function StepSetup({ flow }: { flow: WelcomeFlow }) {
  const app = useAppContext();
  const entrance = useEntrance("setup");
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [found, setFound] = useState<RememberedDesktop[]>(app.rememberedDesktops);
  const startedRef = useRef(false);

  const runDiscovery = useCallback(async () => {
    if (app.checkingHealth) return;
    setFound([]);
    const results = await app.discoverPairableDesktops();
    setFound(results);
  }, [app]);

  useEffect(() => {
    if (mode !== "auto" || startedRef.current) return;
    startedRef.current = true;
    void runDiscovery();
  }, [mode, runDiscovery]);

  const onPick = (desktop: RememberedDesktop) => {
    void app.pairMachineAt(desktop.url, desktop.pairCode);
  };

  return (
    <Animated.View style={[{ flex: 1, opacity: entrance.opacity, transform: [{ translateY: entrance.translateY }], gap: 12 }]}>
      <SkipPill floating onPress={flow.requestSkip} />
      <View style={[styles.header, { marginTop: 12 }]}>
        <Text style={styles.eyebrow}>{welcomeCopy.setup.eyebrow}</Text>
        <Text style={styles.title}>{welcomeCopy.setup.title}</Text>
        <Text style={styles.body1}>{welcomeCopy.setup.body}</Text>
      </View>
      <RadarPulse active={mode === "auto" && app.checkingHealth} />
      <View style={styles.modeTabs}>
        {(["auto", "manual"] as const).map((value) => {
          const active = mode === value;
          return (
            <Pressable accessibilityRole="button" key={value} onPress={() => setMode(value)} style={[styles.modeTab, active ? styles.modeTabActive : null]}>
              <Ionicons accessible={false} color={active ? colors.text : colors.muted} name={value === "auto" ? "wifi-outline" : "keypad-outline"} size={15} />
              <Text style={[styles.modeTabText, active ? styles.modeTabTextActive : null]}>{value === "auto" ? welcomeCopy.setup.autoTab : welcomeCopy.setup.manualTab}</Text>
            </Pressable>
          );
        })}
      </View>
      {mode === "auto" ? <AutoPane app={app} found={found} run={runDiscovery} onPick={onPick} /> : <ManualPane />}
      {app.pairingError ? <Text style={styles.errorText}>{app.pairingError}</Text> : null}
    </Animated.View>
  );
}

function AutoPane({ app, found, run, onPick }: { app: ReturnType<typeof useAppContext>; found: RememberedDesktop[]; run: () => void; onPick: (d: RememberedDesktop) => void }) {
  const empty = !app.checkingHealth && found.length === 0;
  return (
    <View>
      {app.checkingHealth ? (
        <View style={styles.searchingRow}>
          <Text style={styles.searchingText}>{welcomeCopy.setup.autoSearching}</Text>
        </View>
      ) : null}
      {found.length > 0 ? (
        <View style={styles.desktopList}>
          {found.map((desktop) => (
            <Pressable accessibilityRole="button" disabled={app.pairing || desktop.status === "offline"} key={desktop.url} onPress={() => onPick(desktop)} style={[styles.desktopRow, desktop.status === "offline" ? { opacity: 0.5 } : null]}>
              <Ionicons accessible={false} color="#D8A6FF" name="desktop-outline" size={20} />
              <View style={{ flex: 1 }}>
                <Text style={styles.desktopName}>{desktop.machineName}</Text>
                <Text style={styles.desktopStatus}>{statusLabel(desktop.status)}</Text>
              </View>
              <Ionicons accessible={false} color="#D8A6FF" name="chevron-forward" size={16} />
            </Pressable>
          ))}
        </View>
      ) : null}
      {empty ? <Text style={styles.helpText}>{welcomeCopy.setup.autoEmpty}</Text> : null}
      <View style={{ marginTop: 14 }}>
        <PrimaryButton disabled={app.checkingHealth} iconName="search" label={welcomeCopy.setup.autoRetry} onPress={run} />
      </View>
    </View>
  );
}

function ManualPane() {
  const app = useAppContext();
  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.helpText}>{welcomeCopy.setup.manualLabel}</Text>
      <TextInput
        accessibilityLabel="6 character pairing code"
        autoCapitalize="characters"
        autoComplete="one-time-code"
        autoCorrect={false}
        maxLength={6}
        onChangeText={(value) => app.setPairCode(value.toUpperCase())}
        onSubmitEditing={() => void app.pairMachine()}
        placeholder={welcomeCopy.setup.manualPlaceholder}
        placeholderTextColor={colors.dim}
        returnKeyType="done"
        style={styles.codeInput}
        value={app.pairCode}
      />
      <PrimaryButton disabled={app.pairing} iconName="link-outline" label={app.pairing ? "Connecting..." : welcomeCopy.setup.manualCta} onPress={() => void app.pairMachine()} />
    </View>
  );
}

function statusLabel(status: RememberedDesktop["status"]) {
  if (status === "current") return "Connected now";
  if (status === "online") return "Available nearby";
  if (status === "checking") return "Checking...";
  return "Remembered, offline";
}
