import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemedColor } from "../../../context/PreferencesContext";
import { styles } from "../styles";

export type IconName = keyof typeof Ionicons.glyphMap;

export type MenuRow = {
  icon?: IconName;
  label: string;
  meta?: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
};

export function WorkspaceMenuRow({ row }: { row: MenuRow }) {
  const iconColor = useThemedColor(row.danger ? "#FF9DAE" : row.active ? "#F4F0FF" : "#A6ABB8");
  return (
    <Pressable
      onPress={row.onPress}
      style={({ pressed }) => [
        styles.workspaceMenuRow,
        row.active ? styles.workspaceMenuRowActive : null,
        row.danger ? styles.workspaceMenuRowDanger : null,
        pressed ? styles.workspaceMenuRowPressed : null
      ]}
    >
      {row.icon ? (
        <View style={[styles.workspaceMenuRowIcon, row.active ? styles.workspaceMenuRowIconActive : null]}>
          <Ionicons name={row.icon} color={iconColor} size={20} />
        </View>
      ) : null}
      <Text numberOfLines={1} style={[styles.workspaceMenuRowLabel, row.active ? styles.workspaceMenuRowLabelActive : null, row.danger ? styles.workspaceMenuRowLabelDanger : null]}>{row.label}</Text>
      {row.meta ? <Text numberOfLines={1} style={[styles.workspaceMenuRowMeta, row.active ? styles.workspaceMenuRowMetaActive : null]}>{row.meta}</Text> : null}
    </Pressable>
  );
}
