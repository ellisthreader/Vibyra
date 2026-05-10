import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, Image, ImageBackground, KeyboardAvoidingView, Linking, Modal,
  NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View
} from "react-native";
import type { ImageStyle, StyleProp, TextStyle, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, LinearGradient as SvgGradient, Path, Rect, Stop } from "react-native-svg";
import { AppWebView } from "../../../components/AppWebView";
import { VibyraLogo } from "../../../components/VibyraLogo";
import { colors } from "../../../styles/theme";
import type { Agent, ChatMessage, GeneratedApp, ModelKey, Project, RememberedDesktop } from "../../../types/domain";
import { appApiRequest } from "../../../utils/appApi";
import { fetchWithTimeout, normalizeAgentUrl } from "../../../utils/network";
import { aiChatGlyph, chatBuildAiHero, communityHero, dashboardHeroArt, projectsBackdrop, projectsFoldersHero, vibyraLogo } from "../data/assets";
import { chatModelGroups, chatModelOptions, providerLogoSources } from "../data/chatModels";
import { COMMUNITY_COMMENTS_KEY, communityDetailAccent, communityDetailAccentDark, communityPosts } from "../data/community";
import { chatSuggestions, pages, previousChats, projectFilterModes, projectStatuses, tokenMembership } from "../data/pages";
import { styles } from "../styles";
import type { ChatModelOption, ChatModelProvider, CommunityComment, CommunityDetailTab, CommunityFilter, CommunityLogoKind, CommunityPost, CommunityPreviewKind, DashboardPage, DesktopCandidate, ProjectDisplay, ProjectLayout, SettingsTab } from "../types";
import { diffCounts, SYNTAX_COLORS, tokenize } from "../../../utils/syntaxHighlight";

type MessageBlock =
  | { kind: "code"; language: string; filename: string; code: string; streaming: boolean }
  | { kind: "spacer" }
  | { kind: "heading"; level: number; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "numbered"; marker: string; text: string }
  | { kind: "paragraph"; text: string };

const TYPING_CURSOR_CHARS = /▍+\s*$/;

function parseFenceInfo(info: string): { language: string; filename: string } {
  const tokens = info.trim().split(/\s+/).filter(Boolean);
  let language = "";
  let filename = "";
  for (const token of tokens) {
    const looksLikePath = /[\/.]/.test(token) && !/^[a-z0-9+#-]+$/i.test(token);
    if (!filename && (looksLikePath || /\.[a-z0-9]+$/i.test(token))) {
      filename = token;
    } else if (!language) {
      language = token;
    }
  }
  if (!language && filename) {
    const ext = /\.([a-z0-9]+)$/i.exec(filename);
    if (ext) language = ext[1];
  }
  return { language, filename };
}

export function parseMessageBlocks(input: string): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  const closedFenceRegex = /```([^\n`]*)\n?([\s\S]*?)```/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = closedFenceRegex.exec(input)) !== null) {
    if (match.index > cursor) {
      pushTextBlocks(blocks, input.slice(cursor, match.index));
    }
    const { language, filename } = parseFenceInfo(match[1]);
    blocks.push({
      kind: "code",
      language,
      filename,
      code: match[2].replace(/\n$/, ""),
      streaming: false,
    });
    cursor = match.index + match[0].length;
  }
  if (cursor < input.length) {
    const tail = input.slice(cursor);
    const openFenceIndex = tail.indexOf("```");
    if (openFenceIndex >= 0) {
      if (openFenceIndex > 0) {
        pushTextBlocks(blocks, tail.slice(0, openFenceIndex));
      }
      const afterFence = tail.slice(openFenceIndex + 3);
      const newlineIdx = afterFence.indexOf("\n");
      const info = newlineIdx >= 0 ? afterFence.slice(0, newlineIdx) : afterFence;
      const body = newlineIdx >= 0 ? afterFence.slice(newlineIdx + 1) : "";
      const { language, filename } = parseFenceInfo(info);
      blocks.push({
        kind: "code",
        language,
        filename,
        code: body.replace(TYPING_CURSOR_CHARS, "").replace(/\n$/, ""),
        streaming: true,
      });
    } else {
      pushTextBlocks(blocks, tail);
    }
  }
  return blocks;
}

export function pushTextBlocks(blocks: MessageBlock[], text: string) {
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (blocks.length && blocks[blocks.length - 1].kind !== "spacer") {
        blocks.push({ kind: "spacer" });
      }
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    if (bullet) {
      blocks.push({ kind: "bullet", text: bullet[1] });
      continue;
    }
    const numbered = /^(\d+)[.)]\s+(.+)$/.exec(trimmed);
    if (numbered) {
      blocks.push({ kind: "numbered", marker: `${numbered[1]}.`, text: numbered[2] });
      continue;
    }
    blocks.push({ kind: "paragraph", text: trimmed });
  }
}

export function renderInline(text: string, keyPrefix: string) {
  const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  const parts = text.split(tokenRegex).filter((part) => part.length > 0);
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <Text key={key} style={styles.messageBold}>{part.slice(2, -2)}</Text>;
    }
    if (/^`[^`]+`$/.test(part)) {
      return <Text key={key} style={styles.messageInlineCode}>{part.slice(1, -1)}</Text>;
    }
    return <Text key={key}>{part}</Text>;
  });
}

function CollapsibleCodeBlock({
  language,
  filename,
  code,
  streaming,
}: {
  language: string;
  filename: string;
  code: string;
  streaming: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const headerLabel = filename || (language ? language.toLowerCase() : "code");
  const counts = useMemo(() => diffCounts(code), [code]);
  const tokens = useMemo(
    () => (expanded ? tokenize(code, language || filename.split(".").pop() || "") : []),
    [expanded, code, language, filename]
  );

  return (
    <View style={styles.messageCodeBlock}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? "Hide" : "Show"} code for ${headerLabel}`}
        onPress={() => setExpanded((prev) => !prev)}
        style={styles.messageCodeBlockHeader}
      >
        <Ionicons
          name={expanded ? "chevron-down" : "chevron-forward"}
          size={14}
          color="#9E98AD"
        />
        <Text style={styles.messageCodeBlockLang} numberOfLines={1}>
          {headerLabel}
        </Text>
        <View style={styles.messageCodeBlockCounts}>
          {counts.added > 0 ? (
            <Text style={styles.messageCodeBlockAdded}>+{counts.added}</Text>
          ) : null}
          {counts.removed > 0 ? (
            <Text style={styles.messageCodeBlockRemoved}>-{counts.removed}</Text>
          ) : null}
          {streaming ? (
            <Text style={styles.messageCodeBlockStreaming}>writing…</Text>
          ) : null}
        </View>
      </Pressable>
      {expanded ? (
        <View style={styles.messageCodeBlockBody}>
          <Text style={styles.messageCodeBlockText}>
            {tokens.map((token, index) => (
              <Text key={index} style={{ color: SYNTAX_COLORS[token.kind] }}>
                {token.text}
              </Text>
            ))}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function RichMessageText({ text }: { text: string }) {
  const blocks = useMemo(() => parseMessageBlocks(text), [text]);

  return (
    <View style={styles.messageBody}>
      {blocks.map((block, index) => {
        const key = `block-${index}`;
        if (block.kind === "code") {
          return (
            <CollapsibleCodeBlock
              key={key}
              language={block.language}
              filename={block.filename}
              code={block.code}
              streaming={block.streaming}
            />
          );
        }
        if (block.kind === "heading") {
          const headingStyle = block.level === 1
            ? styles.messageHeading1
            : block.level === 2
              ? styles.messageHeading2
              : styles.messageHeading3;
          return <Text key={key} style={headingStyle}>{renderInline(block.text, key)}</Text>;
        }
        if (block.kind === "bullet") {
          return (
            <View key={key} style={styles.messageListRow}>
              <Text style={styles.messageBulletDot}>•</Text>
              <Text style={[styles.messageText, styles.messageListText]}>{renderInline(block.text, key)}</Text>
            </View>
          );
        }
        if (block.kind === "numbered") {
          return (
            <View key={key} style={styles.messageListRow}>
              <Text style={styles.messageNumberedMarker}>{block.marker}</Text>
              <Text style={[styles.messageText, styles.messageListText]}>{renderInline(block.text, key)}</Text>
            </View>
          );
        }
        if (block.kind === "spacer") {
          return <View key={key} style={styles.messageSpacer} />;
        }
        return <Text key={key} style={styles.messageText}>{renderInline(block.text, key)}</Text>;
      })}
    </View>
  );
}

export function CommunityMiniCard({ post }: { post: typeof communityPosts[number] }) {
  return (
    <View style={styles.communityMiniCard}>
      <Text style={styles.statusLabel}>{post.tag}</Text>
      <Text style={styles.postTitle}>{post.title}</Text>
      <Text style={styles.projectMeta}>{post.user} · {post.likes} likes · {post.comments} comments</Text>
    </View>
  );
}

