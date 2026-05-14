import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../../styles/theme";
import { usePreferences, useThemedColor } from "../../../context/PreferencesContext";
import type { ChatSkill } from "../../../utils/appApi";
import type { ChatCommand } from "../data/chatCommands";

type Props = {
  commands: ChatCommand[];
  skills: ChatSkill[];
  onSelectCommand: (command: ChatCommand) => void;
  onSelectSkill: (skill: ChatSkill) => void;
};

export function SlashCommandMenu({ commands, skills, onSelectCommand, onSelectSkill }: Props) {
  const prefs = usePreferences();
  const commandIconColor = useThemedColor("#B084FF");
  const skillIconColor = useThemedColor("#FDE68A");
  const menuStyle = prefs.effectiveScheme === "light"
    ? { backgroundColor: prefs.colors.surface, borderColor: prefs.colors.border, shadowColor: prefs.colors.shadow }
    : null;
  const headingStyle = prefs.effectiveScheme === "light" ? { color: prefs.colors.dim } : null;
  const slashStyle = prefs.effectiveScheme === "light" ? { color: prefs.colors.accent } : null;
  const labelStyle = prefs.effectiveScheme === "light" ? { color: prefs.colors.text } : null;
  const descriptionStyle = prefs.effectiveScheme === "light" ? { color: prefs.colors.muted } : null;
  const commandIconWrapStyle = prefs.effectiveScheme === "light" ? { backgroundColor: prefs.colors.accentSoft } : null;
  const skillIconWrapStyle = prefs.effectiveScheme === "light" ? { backgroundColor: prefs.colors.warningSoft } : null;
  const rowPressedStyle = prefs.effectiveScheme === "light" ? { backgroundColor: prefs.colors.accentSoft } : styles.rowPressed;
  if (commands.length === 0 && skills.length === 0) return null;
  return (
    <View style={[styles.menu, menuStyle]}>
      {commands.length > 0 ? (
        <View>
          <Text style={[styles.heading, headingStyle]}>Commands</Text>
          {commands.map((command) => (
            <Pressable
              key={command.id}
              onPress={() => onSelectCommand(command)}
              style={({ pressed }) => [styles.row, pressed && rowPressedStyle]}
            >
              <View style={[styles.iconWrap, styles.iconWrapCommand, commandIconWrapStyle]}>
                <Ionicons name={command.icon} color={commandIconColor} size={16} />
              </View>
              <View style={styles.rowBody}>
                <View style={styles.rowMain}>
                  <Text style={[styles.slash, slashStyle]}>{command.slash}</Text>
                  <Text style={[styles.label, labelStyle]}>{command.label}</Text>
                </View>
                <Text numberOfLines={1} style={[styles.description, descriptionStyle]}>{command.description}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
      {skills.length > 0 ? (
        <View style={commands.length > 0 ? styles.skillsBlock : undefined}>
          <Text style={[styles.heading, headingStyle]}>Skills</Text>
          {skills.map((skill) => (
            <Pressable
              key={skill.id}
              onPress={() => onSelectSkill(skill)}
              style={({ pressed }) => [styles.row, pressed && rowPressedStyle]}
            >
              <View style={[styles.iconWrap, styles.iconWrapSkill, skillIconWrapStyle]}>
                <Ionicons name="sparkles-outline" color={skillIconColor} size={16} />
              </View>
              <View style={styles.rowBody}>
                <View style={styles.rowMain}>
                  <Text style={[styles.slash, slashStyle]}>{skill.slash}</Text>
                  <Text style={[styles.label, labelStyle]}>{skill.label}</Text>
                </View>
                {skill.description ? (
                  <Text numberOfLines={1} style={[styles.description, descriptionStyle]}>{skill.description}</Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  menu: {
    backgroundColor: "#13131F",
    borderColor: "rgba(176, 132, 255, 0.24)",
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    padding: 6,
    shadowColor: "#8E3CFF",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 18
  },
  heading: {
    color: "#8F8A9E",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 6,
    textTransform: "uppercase"
  },
  row: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  rowPressed: { backgroundColor: "rgba(142, 60, 255, 0.14)" },
  iconWrap: {
    alignItems: "center",
    borderRadius: 8,
    height: 28,
    justifyContent: "center",
    width: 28
  },
  iconWrapCommand: { backgroundColor: "rgba(176, 132, 255, 0.10)" },
  iconWrapSkill: { backgroundColor: "rgba(253, 230, 138, 0.10)" },
  rowBody: { flex: 1 },
  rowMain: { alignItems: "center", flexDirection: "row", gap: 10 },
  slash: {
    color: "#B084FF",
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    fontWeight: "800"
  },
  label: { color: colors.text, fontSize: 14, fontWeight: "700" },
  description: { color: "#8F8A9E", fontSize: 12, marginTop: 2 },
  skillsBlock: { marginTop: 4 }
});
