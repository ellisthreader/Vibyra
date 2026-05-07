import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Image, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GradientWord } from "../components/GradientWord";
import { momentIcons } from "../data/options";
import { syncFeatures } from "../data/syncFeatures";
import { getMomentContent } from "../persona";
import { Answers, QuizStep } from "../types";
import { styles } from "../styles";

export function QuestionMomentScreen(props: {
  step: QuizStep;
  answers: Answers;
}) {
  const insets = useSafeAreaInsets();
  const { answers, step } = props;
  const content = getMomentContent(answers);
  const image = momentIcons[step] ?? momentIcons[2];
  const contentInsets = {
    paddingBottom: Math.max(insets.bottom + 14, 28),
    paddingTop: Math.max(insets.top + 14, 28)
  };

  return (
    <LinearGradient
      colors={["#04070C", "#061A24", "#07070A"]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={styles.syncScreen}
    >
      <View pointerEvents="none" style={styles.syncAuraCyan} />
      <View pointerEvents="none" style={styles.syncAuraPurple} />
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(46, 235, 255, 0.16)", "rgba(109, 59, 255, 0.08)", "rgba(242, 58, 205, 0)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.syncAuroraBand}
      />
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(255, 179, 71, 0.11)", "rgba(242, 58, 205, 0.08)", "rgba(46, 235, 255, 0)"]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.syncAuroraBandBottom}
      />
      <View pointerEvents="none" style={styles.syncStarOne} />
      <View pointerEvents="none" style={styles.syncStarTwo} />

      <ScrollView contentContainerStyle={[styles.syncContent, contentInsets]} showsVerticalScrollIndicator={false}>
        <View style={styles.syncPill}>
          <Ionicons name="sync" color="#2EEBFF" size={17} />
          <Text style={styles.syncPillText}>Cross-device sync</Text>
        </View>

        <View style={styles.syncTitleBlock}>
          <Text style={styles.syncTitle}>Start anywhere.</Text>
          <View style={styles.syncTitleLine}>
            <Text style={styles.syncTitleInline}>Continue </Text>
            <GradientWord text="Everywhere." />
          </View>
        </View>

        <Text style={styles.syncSubtitle}>{content.body}</Text>

        <View style={styles.syncHero}>
          <View style={styles.syncHeroGlowBlue} />
          <View style={styles.syncHeroGlowPink} />
          <View style={styles.syncHeroGlowPurple} />
          <Image resizeMode="contain" source={image} style={styles.syncHeroImage} />
        </View>
        <View style={styles.syncCards}>
          {syncFeatures.map((feature) => (
            <View
              key={feature.title}
              style={[styles.syncCard, { backgroundColor: feature.backgroundColor, borderColor: feature.borderColor }]}
            >
              <View
                style={[
                  styles.syncCardIcon,
                  { backgroundColor: feature.iconBackgroundColor, borderColor: feature.borderColor, shadowColor: feature.color }
                ]}
              >
                <Ionicons name={feature.icon} color={feature.color} size={21} />
              </View>
              <View style={styles.syncCardCopy}>
                <Text style={styles.syncCardTitle}>{feature.title}</Text>
                <Text style={styles.syncCardBody}>{feature.body}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </LinearGradient>
  );
}
