import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Keyboard, Modal, Pressable, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AppWebView } from "../../../components/AppWebView";
import { useAppContext } from "../../../context/AppContext";
import { useThemedColor } from "../../../context/PreferencesContext";
import type { PreviewRuntimeError } from "../../../components/AppWebView";
import type { GeneratedApp } from "../../../types/domain";
import { styles } from "../styles";
import { chatModelOptionFor } from "../data/chatModels";
import { AppPreviewEditStatus, PreviewEditStatus } from "./AppPreviewEditStatus";
import { PreviewErrorPanel } from "./AppPreviewErrorPanel";
import { AppPreviewMiniChat } from "./AppPreviewMiniChat";
import { previewAppFingerprint } from "./previewAppFingerprint";
import { buildFixPrompt } from "./previewFixPrompt";

export function AppPreviewModal({
  app,
  onClose,
  onSubmitAiPrompt
}: {
  app: GeneratedApp | null;
  onClose: () => void;
  onSubmitAiPrompt: (prompt: string) => Promise<boolean> | boolean;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [reloadKey, setReloadKey] = useState(0);
  const [editStatus, setEditStatus] = useState<PreviewEditStatus>("idle");
  const [editDoneMessage, setEditDoneMessage] = useState("");
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [miniChatOpen, setMiniChatOpen] = useState(false);
  const [miniChatHeight, setMiniChatHeight] = useState(54);
  const [previewErrors, setPreviewErrors] = useState<PreviewRuntimeError[]>([]);
  const [actionsOpen, setActionsOpen] = useState(false);
  const entrance = useRef(new Animated.Value(0)).current;
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appCtx = useAppContext();
  const modelKey = appCtx.selectedChatModel || appCtx.selectedModel;
  const modelLabel = chatModelOptionFor(modelKey)?.label ?? String(modelKey || "AI");
  const headerIconColor = useThemedColor("#FFFFFF");

  const appFingerprint = useMemo(() => previewAppFingerprint(app), [app?.html, app?.id, app?.url]);

  useEffect(() => {
    if (!app) return;
    setReloadKey(0);
    setMiniChatOpen(false);
    setMiniChatHeight(54);
    setPreviewErrors([]);
    setActionsOpen(false);
    entrance.setValue(0);
    Animated.spring(entrance, {
      toValue: 1,
      damping: 22,
      mass: 0.92,
      overshootClamping: true,
      stiffness: 135,
      useNativeDriver: true
    }).start();
  }, [appFingerprint, entrance]);

  useEffect(() => () => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (event) => {
      setKeyboardInset(Math.max(0, event.endCoordinates.height - insets.bottom));
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardInset(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [insets.bottom]);

  if (!app) return null;
  const previewApp = app;

  const latestError = previewErrors[previewErrors.length - 1];

  function handlePreviewError(error: PreviewRuntimeError) {
    setPreviewErrors((current) => {
      const signature = `${error.type}:${error.message}:${error.source ?? ""}:${error.line ?? ""}:${error.column ?? ""}`;
      const alreadyCaptured = current.some((item) => `${item.type}:${item.message}:${item.source ?? ""}:${item.line ?? ""}:${item.column ?? ""}` === signature);
      if (alreadyCaptured) return current;
      return [...current, error].slice(-8);
    });
  }

  function askAiToFix() {
    if (!latestError) return;
    appCtx.setTaskText(buildFixPrompt(previewApp, previewErrors));
    closePreview();
  }

  function closePreview() {
    Animated.timing(entrance, {
      toValue: 0,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true
    }).start(() => onClose());
  }

  function refreshPreview() {
    setActionsOpen(false);
    setPreviewErrors([]);
    setReloadKey((k) => k + 1);
  }

  async function submitAiPrompt(prompt: string) {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setEditDoneMessage(doneMessageForPrompt(prompt));
    setEditStatus("running");
    try {
      const started = await onSubmitAiPrompt(prompt);
      if (!started) {
        setEditStatus("error");
        statusTimerRef.current = setTimeout(() => setEditStatus("idle"), 3600);
        return false;
      }
      setEditStatus("done");
      statusTimerRef.current = setTimeout(() => setEditStatus("idle"), 2600);
      return true;
    } catch (error) {
      setEditStatus("error");
      statusTimerRef.current = setTimeout(() => setEditStatus("idle"), 3600);
      throw error;
    }
  }

  const previewBottomOffset = 18 + keyboardInset;
  const errorBottomOffset = previewBottomOffset + (miniChatOpen ? miniChatHeight - 1 : 62);
  const translateY = entrance.interpolate({ inputRange: [0, 1], outputRange: [-Math.min(height, 920), 0] });
  const opacity = entrance.interpolate({ inputRange: [0, 0.22, 1], outputRange: [0, 0.98, 1] });
  const scale = entrance.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] });

  return (
    <Modal animationType="none" presentationStyle="overFullScreen" transparent visible onRequestClose={closePreview}>
      <View style={styles.appModalBackdrop}>
        <Animated.View style={[styles.appModalScreen, { paddingTop: Math.max(insets.top, 60), opacity, transform: [{ translateY }, { scale }] }]}>
        <View style={styles.appModalHeader}>
          <Pressable onPress={closePreview} style={styles.appModalIconButton}>
            <Ionicons name="close" color={headerIconColor} size={22} />
          </Pressable>
          <View style={styles.appModalTitleStack}>
            <Text numberOfLines={1} style={styles.appModalTitle}>{previewApp.title}</Text>
          </View>
          <Pressable onPress={() => setActionsOpen((open) => !open)} style={styles.appModalIconButton}>
            <Ionicons name="ellipsis-horizontal" color={headerIconColor} size={21} />
          </Pressable>
          {actionsOpen ? (
            <View style={styles.appModalActionMenu}>
              <Pressable onPress={refreshPreview} style={styles.appModalActionRow}>
                <Ionicons name="refresh" color={headerIconColor} size={17} />
                <Text style={styles.appModalActionText}>Refresh</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
        <View style={styles.appModalWebContainer}>
          <AppWebView html={previewApp.html} onPreviewError={handlePreviewError} url={previewApp.url} reloadKey={reloadKey} style={styles.appModalWebView} />
          <AppPreviewEditStatus doneMessage={editDoneMessage} modelLabel={modelLabel} status={editStatus} />
          {latestError ? (
            <PreviewErrorPanel
              bottomOffset={errorBottomOffset}
              connectedToChat={miniChatOpen}
              errors={previewErrors}
              onAskAi={askAiToFix}
              onDismiss={() => setPreviewErrors([])}
            />
          ) : null}
          <AppPreviewMiniChat
            agentRequesting={appCtx.agentRequesting}
            app={previewApp}
            bottomOffset={previewBottomOffset}
            connectedAbove={Boolean(latestError)}
            onHeightChange={setMiniChatHeight}
            onOpenChange={setMiniChatOpen}
            onSubmit={submitAiPrompt}
          />
        </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function doneMessageForPrompt(prompt: string) {
  const lowerPrompt = prompt.toLowerCase();
  if (/\b(error|bug|broken|crash|blank|not working|issue|fix)\b/.test(lowerPrompt)) {
    return "I fixed the preview issue and refreshed the live app.";
  }
  return "I implemented your preview change and refreshed the live app.";
}
