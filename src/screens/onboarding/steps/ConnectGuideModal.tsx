import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Image, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../../styles/theme";
import { connectBackdrop } from "../data/options";
import { connectGuideSteps, connectGuideTips, connectGuideTroubleshooting } from "../data/connectGuide";
import { styles } from "../styles";

export function ConnectGuideModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.connectGuideOverlay}>
        <Image source={connectBackdrop} resizeMode="cover" style={styles.connectBackdropImage} />
        <View style={styles.connectGuideScrim} />
        <ScrollView
          contentContainerStyle={[
            styles.connectGuideContent,
            { paddingBottom: Math.max(insets.bottom + 24, 36), paddingTop: Math.max(insets.top + 14, 28) }
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.connectGuideHero}>
            <Pressable style={({ pressed }) => [styles.connectGuideClose, pressed ? styles.connectActionPressed : null]} onPress={onClose}>
              <Ionicons name="close" color={colors.text} size={22} />
            </Pressable>
            <View style={styles.connectGuideHeroIcon}>
              <Ionicons name="rocket-outline" color="#C97BFF" size={28} />
            </View>
            <Text style={styles.connectGuideTitle}>🚀 Getting Started with Vibyra</Text>
            <Text style={styles.connectGuideIntro}>Follow these simple steps to connect your phone to your computer in seconds.</Text>
          </View>

          <View style={styles.connectGuideStepStack}>
            {connectGuideSteps.map((step) => (
              <View key={step.kicker} style={styles.connectGuideCard}>
                <LinearGradient
                  colors={["rgba(255, 255, 255, 0.08)", "rgba(113, 48, 255, 0.13)", "rgba(255, 255, 255, 0.035)"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.connectGuideCardFill}
                >
                  <View style={styles.connectGuideCardTop}>
                    <View style={styles.connectGuideStepIcon}>
                      <Ionicons name={step.icon} color="#C97BFF" size={22} />
                    </View>
                    <View style={styles.connectGuideCardHeader}>
                      <Text style={styles.connectGuideKicker}>{step.kicker}</Text>
                      <Text style={styles.connectGuideSectionTitle}>{step.title}</Text>
                    </View>
                  </View>
                  <View style={styles.connectGuideBullets}>
                    {step.lines.map((line) => (
                      <View key={line} style={styles.connectGuideBulletRow}>
                        <View style={styles.connectGuideBulletDot} />
                        <Text style={styles.connectGuideBody}>{line}</Text>
                      </View>
                    ))}
                  </View>
                </LinearGradient>
              </View>
            ))}
          </View>

          <View style={styles.connectGuideInfoGrid}>
            <View style={styles.connectGuideInfoCard}>
              <Text style={styles.connectGuideInfoTitle}>❓ Troubleshooting</Text>
              {connectGuideTroubleshooting.map((item) => (
                <View key={item.title} style={styles.connectGuideInfoBlock}>
                  <Text style={styles.connectGuideQuestion}>{item.title}</Text>
                  {item.lines.map((line) => (
                    <Text key={line} style={styles.connectGuideSmallLine}>• {line}</Text>
                  ))}
                </View>
              ))}
            </View>

            <View style={styles.connectGuideInfoCard}>
              <Text style={styles.connectGuideInfoTitle}>💡 Tips</Text>
              {connectGuideTips.map((tip) => (
                <Text key={tip} style={styles.connectGuideSmallLine}>• {tip}</Text>
              ))}
            </View>
          </View>

          <LinearGradient colors={["#762CFF", "#B63AFF", "#FF8D72"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.connectGuideDone}>
            <Pressable style={({ pressed }) => [styles.connectGuideDonePressable, pressed ? styles.connectActionPressed : null]} onPress={onClose}>
              <Text style={styles.connectGuideDoneText}>Enjoy seamless control with Vibyra ✨</Text>
              <Ionicons name="arrow-forward" color={colors.text} size={22} />
            </Pressable>
          </LinearGradient>
        </ScrollView>
      </View>
    </Modal>
  );
}
