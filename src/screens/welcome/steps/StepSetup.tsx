import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Linking, Pressable, Text, View } from "react-native";
import { VibyraLogo } from "../../../components/VibyraLogo";
import { useAppContext } from "../../../context/AppContext";
import { HandshakeGlyph } from "../components/HandshakeGlyph";
import { PrimaryButton } from "../components/PrimaryButton";
import { welcomeCopy } from "../data/welcomeCopy";
import { useLogoMorph } from "../hooks/useLogoMorph";
import { useSetupIntro } from "../hooks/useSetupIntro";
import { useTypewriter } from "../hooks/useTypewriter";
import { WelcomeFlow } from "../types";
import { styles } from "../styles";

const RETRY_MS = 4000;
const ACCOUNT_RETRY_MS = 15000;
const SLOW_SCAN_MS = 60000;
const slowScanMessage = "Still looking for your computer. Keep Vibyra Desktop open, leave the pairing screen visible, and make sure this phone is on the same Wi-Fi.";
const accountErrorMessage = "Log in to Vibyra Desktop with the same account as your phone.";
const DOWNLOAD_URL = "https://vibyra.ai";

export function StepSetup({ flow: _flow }: { flow: WelcomeFlow }) {
  const app = useAppContext();
  const intro = useSetupIntro();
  const morph = useLogoMorph();
  const typed = useTypewriter(welcomeCopy.setup.title, { startDelay: 500, charDelay: 55, blinkAfter: 2 });
  const [slowScan, setSlowScan] = useState(false);
  const [accountError, setAccountError] = useState("");
  const pairingRef = useRef(false);
  const accountRetryAtRef = useRef(0);
  const appRef = useRef(app);
  appRef.current = app;
  const approvalReady = Boolean(app.pendingPhoneApproval);
  const pendingMachineName = app.pendingPhoneApproval?.machineName?.trim();

  useEffect(() => {
    if (app.paired) {
      setAccountError("");
      accountRetryAtRef.current = 0;
      return;
    }

    if (isAccountPairingError(app.pairingError)) {
      setAccountError(accountErrorMessage);
      accountRetryAtRef.current = Date.now() + ACCOUNT_RETRY_MS;
    }
  }, [app.paired, app.pairingError]);

  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const slowScanTimer = setTimeout(() => {
      if (!cancelled && !pairingRef.current) setSlowScan(true);
    }, SLOW_SCAN_MS);

    const sweep = async () => {
      if (cancelled || pairingRef.current || appRef.current.pendingPhoneApproval) return;
      const accountRetryInMs = accountRetryAtRef.current - Date.now();
      if (accountRetryInMs > 0) {
        retry = setTimeout(sweep, accountRetryInMs);
        return;
      }

      const results = await appRef.current.discoverPairableDesktops();
      if (cancelled || pairingRef.current || appRef.current.pendingPhoneApproval) return;
      const reachable = results.filter((d) => d.status === "online" || d.status === "current");
      if (reachable.length > 0) setSlowScan(false);
      for (const target of reachable) {
        if (cancelled || pairingRef.current) return;
        const paired = await appRef.current.pairMachineAt(target.url, target.pairCode);
        if (paired) {
          pairingRef.current = true;
          return;
        }
      }
      retry = setTimeout(sweep, RETRY_MS);
    };

    void sweep();
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      clearTimeout(slowScanTimer);
    };
  }, []);
  const displayError = accountError || simplePairingError(app.pairingError);
  const onConfirm = () => app.confirmPhonePermission();

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.centerStack}>
        <Animated.Text style={[styles.eyebrow, { opacity: intro.eyebrow.opacity }]}>
          {approvalReady ? welcomeCopy.approve.eyebrow : welcomeCopy.setup.eyebrow}
        </Animated.Text>
        <View style={styles.setupTitleRow}>
          <Text style={styles.setupTitle}>{approvalReady ? welcomeCopy.approve.title : typed.value}</Text>
          {!approvalReady && !typed.done ? (
            <View style={[styles.typewriterCaret, typed.caretVisible ? null : styles.typewriterCaretHidden]} />
          ) : null}
        </View>
        {approvalReady ? (
          <View style={styles.setupConfirmBlock}>
            <HandshakeGlyph awaiting />
            <Text style={styles.setupBody}>
              {pendingMachineName ? `${pendingMachineName} is ready. ` : ""}
              {welcomeCopy.approve.body}
            </Text>
            <View style={styles.approvalAction}>
              <PrimaryButton iconName="checkmark-circle" label={welcomeCopy.approve.confirmCta} onPress={onConfirm} />
            </View>
          </View>
        ) : (
          <>
            <Animated.View
              style={[
                styles.morphWrap,
                { opacity: intro.ring.opacity, transform: [{ scale: intro.ring.scale }] }
              ]}
            >
              <Animated.View style={[styles.morphIconLayer, { opacity: morph.logoOpacity, transform: [{ scale: morph.logoScale }] }]}>
                <VibyraLogo compact />
              </Animated.View>
              <Animated.View style={[styles.morphIconLayer, { opacity: morph.desktopOpacity, transform: [{ scale: morph.desktopScale }] }]}>
                <Ionicons accessible={false} color="#E8DBFF" name="desktop-outline" size={64} />
              </Animated.View>
            </Animated.View>
            <Animated.View
              style={{ opacity: intro.helper.opacity, transform: [{ translateY: intro.helper.translateY }] }}
            >
              <Text style={styles.setupBody}>{welcomeCopy.setup.body}</Text>
              <Pressable hitSlop={10} onPress={() => Linking.openURL(DOWNLOAD_URL).catch(() => undefined)}>
                <Text style={styles.setupDownloadLink}>{welcomeCopy.setup.download}</Text>
              </Pressable>
              {slowScan && !displayError ? <Text style={styles.setupScanHelp}>{slowScanMessage}</Text> : null}
              {displayError ? <Text style={styles.errorText}>{displayError}</Text> : null}
            </Animated.View>
          </>
        )}
      </View>
    </View>
  );
}

function simplePairingError(message: string) {
  if (!message) return "";
  if (isAccountPairingError(message)) return accountErrorMessage;
  if (message.toLowerCase().includes("denied")) return "Pairing was denied on your computer.";
  if (message.toLowerCase().includes("offline") || message.toLowerCase().includes("could not reach")) {
    return "Could not reach Vibyra Desktop.";
  }
  return "Could not connect to Vibyra Desktop.";
}

function isAccountPairingError(message: string) {
  const lower = message.toLowerCase();
  return Boolean(message) && (
    lower.includes("same account")
    || lower.includes("different vibyra account")
    || lower.includes("desktop account")
    || lower.includes("phone account identity")
  );
}
