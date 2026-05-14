import React from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../../../styles/theme";
import { useThemedColor } from "../../../../context/PreferencesContext";
import { styles } from "../../styles";

export function ProfileSheet({ visible, onClose, icon, kicker, title, children }: {
  visible: boolean;
  onClose: () => void;
  icon: keyof typeof Ionicons.glyphMap;
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const accentColor = useThemedColor("#C259FF");
  const closeColor = useThemedColor(colors.text);
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.profileSheetOverlay}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.profileSheetScrim} />
        <View style={[styles.profileSheet, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={styles.profileSheetHandle} />
          <View style={styles.profileSheetHeader}>
            <View style={styles.profileSheetHeaderIcon}>
              <Ionicons name={icon} color={accentColor} size={22} />
            </View>
            <View style={styles.profileSheetHeaderCopy}>
              <Text style={styles.profileSheetKicker}>{kicker}</Text>
              <Text numberOfLines={1} style={styles.profileSheetTitle}>{title}</Text>
            </View>
            <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.profileSheetClose}>
              <Ionicons name="close" color={closeColor} size={20} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.profileSheetBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
