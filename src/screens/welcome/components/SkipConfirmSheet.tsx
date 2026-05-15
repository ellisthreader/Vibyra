import React from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { welcomeCopy } from "../data/welcomeCopy";
import { styles } from "../styles";

export function SkipConfirmSheet({
  visible,
  onConfirm,
  onCancel
}: {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <Pressable onPress={onCancel} style={styles.sheetBackdrop}>
        <Pressable onPress={() => {}} style={styles.sheet}>
          <Text style={styles.sheetTitle}>{welcomeCopy.skipSheet.title}</Text>
          <Text style={styles.sheetBody}>{welcomeCopy.skipSheet.body}</Text>
          <View style={styles.sheetRow}>
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              style={[styles.sheetButton, styles.sheetButtonGhost]}
            >
              <Text style={styles.sheetButtonText}>{welcomeCopy.skipSheet.cancel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onConfirm}
              style={[styles.sheetButton, styles.sheetButtonDanger]}
            >
              <Text style={styles.sheetButtonText}>{welcomeCopy.skipSheet.confirm}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
