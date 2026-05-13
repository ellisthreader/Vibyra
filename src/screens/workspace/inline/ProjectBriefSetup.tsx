import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Image, Platform, Pressable, Text, TextInput, View } from "react-native";
import type { ImageStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ProjectBrief } from "../../../types/domain";
import {
  FrameworkOption,
  ProjectKindOption,
  customFrameworkOption,
  customKindOption,
  frameworksForKind,
  projectKindOptions
} from "../../../utils/projectBriefs";
import { vibyraLogo } from "../data/assets";
import { styles } from "../styles";

type Props = {
  onComplete: (brief: ProjectBrief) => void;
  projectName?: string;
};

export function ProjectBriefSetup({ onComplete, projectName }: Props) {
  const [kind, setKind] = useState<ProjectKindOption | null>(null);
  const [customKind, setCustomKind] = useState("");
  const [customStack, setCustomStack] = useState("");
  const [customMode, setCustomMode] = useState<"kind" | "stack" | null>(null);
  const [typedPrompt, setTypedPrompt] = useState("");
  const [showChoices, setShowChoices] = useState(false);
  const rowOpacity = useRef(new Animated.Value(0)).current;
  const rowLift = useRef(new Animated.Value(10)).current;
  const choicesOpacity = useRef(new Animated.Value(0)).current;
  const choicesLift = useRef(new Animated.Value(8)).current;
  const frameworks = useMemo(() => frameworksForKind(kind?.id ?? ""), [kind]);
  const prompt = kind
    ? `For ${kind.label.toLowerCase()}, I recommend starting with one of these stacks.`
    : "What are you creating? Pick a direction so I can set up the first AI run properly.";

  useEffect(() => {
    Animated.parallel([
      Animated.timing(rowOpacity, { toValue: 1, duration: 280, useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(rowLift, { toValue: 0, duration: 360, useNativeDriver: Platform.OS !== "web" })
    ]).start();
  }, [rowLift, rowOpacity]);

  useEffect(() => {
    setTypedPrompt("");
    setShowChoices(false);
    choicesOpacity.setValue(0);
    choicesLift.setValue(8);
    let index = 0;
    const timer = setInterval(() => {
      index += 1;
      setTypedPrompt(prompt.slice(0, index));
      if (index >= prompt.length) {
        clearInterval(timer);
        setTimeout(() => {
          setShowChoices(true);
          Animated.parallel([
            Animated.timing(choicesOpacity, { toValue: 1, duration: 260, useNativeDriver: Platform.OS !== "web" }),
            Animated.timing(choicesLift, { toValue: 0, duration: 320, useNativeDriver: Platform.OS !== "web" })
          ]).start();
        }, 160);
      }
    }, 18);
    return () => clearInterval(timer);
  }, [choicesLift, choicesOpacity, prompt]);

  function complete(framework: FrameworkOption) {
    if (!kind) return;
    onComplete({
      kindId: kind.id,
      kindLabel: kind.label,
      frameworkId: framework.id,
      frameworkLabel: framework.label,
      frameworkDescription: framework.description
    });
  }

  function useCustomKind() {
    const label = customKind.trim();
    if (!label) return;
    setKind({ ...customKindOption, id: `custom-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, label });
    setCustomMode(null);
  }

  function useCustomStack() {
    const label = customStack.trim();
    if (!label) return;
    complete({ ...customFrameworkOption, id: `custom-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, label });
  }

  return (
    <View style={styles.projectBriefShell}>
      <Animated.View style={[styles.messageRow, styles.messageRowAssistant, { opacity: rowOpacity, transform: [{ translateY: rowLift }] }]}>
        <View style={[styles.messageAvatar, styles.messageAvatarAssistant]}>
          <Image resizeMode="contain" source={vibyraLogo} style={styles.messageAvatarLogo as ImageStyle} />
        </View>
        <View style={styles.messageContent}>
          <Text style={[styles.messageAuthor, styles.messageAuthorAssistant]}>Vibyra</Text>
          {projectName ? <Text numberOfLines={1} style={styles.messageFile}>{projectName}</Text> : null}
          <Text style={styles.messageText}>
            {typedPrompt}
            {!showChoices ? <Text style={styles.projectBriefCursor}>|</Text> : null}
          </Text>

          {showChoices ? (
            <Animated.View style={{ opacity: choicesOpacity, transform: [{ translateY: choicesLift }] }}>
              {!kind ? (
                <View style={styles.projectBriefGrid}>
                  {[...projectKindOptions, customKindOption].map((option) => (
                    <Pressable key={option.id} onPress={() => option.id === "custom" ? setCustomMode("kind") : setKind(option)} style={({ pressed }) => [styles.projectBriefOption, pressed && styles.projectBriefOptionPressed]}>
                      <View style={styles.projectBriefOptionIcon}>
                        <Ionicons name={option.icon as keyof typeof Ionicons.glyphMap} color="#D7C4FF" size={18} />
                      </View>
                      <Text numberOfLines={1} style={styles.projectBriefOptionTitle}>{option.label}</Text>
                      <Text numberOfLines={2} style={styles.projectBriefOptionText}>{option.description}</Text>
                    </Pressable>
                  ))}
                  {customMode === "kind" ? <CustomInput value={customKind} onChange={setCustomKind} onSubmit={useCustomKind} placeholder="What are you creating?" label="Use custom type" /> : null}
                </View>
              ) : (
                <View style={styles.projectBriefFrameworks}>
                  <View style={styles.projectBriefStepRow}>
                    <Pressable onPress={() => setKind(null)} style={styles.projectBriefBackButton}>
                      <Ionicons name="chevron-back" color="#B9B5C8" size={17} />
                    </Pressable>
                    <Text style={styles.projectBriefStepTitle}>Best frameworks for {kind.label.toLowerCase()}</Text>
                  </View>
                  {[...frameworks, customFrameworkOption].map((framework) => (
                    <Pressable key={framework.id} onPress={() => framework.id === "custom-stack" ? setCustomMode("stack") : complete(framework)} style={({ pressed }) => [styles.projectBriefFramework, framework.recommended && styles.projectBriefFrameworkRecommended, pressed && styles.projectBriefOptionPressed]}>
                      <View style={styles.projectBriefFrameworkText}>
                        <Text numberOfLines={1} style={styles.projectBriefFrameworkTitle}>{framework.label}</Text>
                        <Text numberOfLines={2} style={styles.projectBriefFrameworkDescription}>{framework.description}</Text>
                      </View>
                      {framework.recommended ? <Text style={styles.projectBriefRecommendedPill}>Recommended</Text> : null}
                      <Ionicons name="chevron-forward" color="#9F99B6" size={17} />
                    </Pressable>
                  ))}
                  {customMode === "stack" ? <CustomInput value={customStack} onChange={setCustomStack} onSubmit={useCustomStack} placeholder="Custom framework or stack" label="Use custom stack" /> : null}
                </View>
              )}
            </Animated.View>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

function CustomInput({ label, onChange, onSubmit, placeholder, value }: {
  label: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  value: string;
}) {
  return (
    <View style={styles.projectBriefCustomPanel}>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#8F8A9E" style={styles.projectBriefCustomInput} />
      <Pressable onPress={onSubmit} style={({ pressed }) => [styles.projectBriefCustomButton, pressed && styles.projectBriefOptionPressed]}>
        <Text style={styles.projectBriefCustomButtonText}>{label}</Text>
        <Ionicons name="arrow-forward" color="#FFFFFF" size={16} />
      </Pressable>
    </View>
  );
}
