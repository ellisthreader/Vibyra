import { Ionicons } from "@expo/vector-icons";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo } from "react";
import { Animated, Image, Text, View } from "react-native";
import { personaInsights } from "../data/personas";
import { resultBulletAccents } from "../data/options";
import { Persona, PersonaModel } from "../types";
import { styles } from "../styles";

export function InsightScreen({ personaId, persona }: { personaId: Persona; persona: PersonaModel }) {
  const insight = personaInsights[personaId];
  const nameParts = persona.name.split(" ");
  const titleLead = nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : "";
  const titleAccent = nameParts[nameParts.length - 1] ?? persona.name;
  const cardEntrances = useMemo(
    () => insight.bullets.map(() => new Animated.Value(0)),
    [insight.bullets]
  );

  useEffect(() => {
    cardEntrances.forEach((entrance) => entrance.setValue(0));

    Animated.stagger(
      145,
      cardEntrances.map((entrance) =>
        Animated.spring(entrance, { toValue: 1, damping: 18, mass: 0.82, stiffness: 118, useNativeDriver: true })
      )
    ).start();
  }, [cardEntrances, personaId]);

  return (
    <View style={styles.resultContent}>
      <View style={styles.personaHero}>
        <View pointerEvents="none" style={styles.personaHeroOrbit} />
        <View pointerEvents="none" style={styles.personaHeroGlow} />
        <Image resizeMode="contain" source={persona.icon} style={styles.personaIcon} />
      </View>

      <View style={styles.resultTitleBlock}>
        <Text style={styles.resultTitlePrimary}>
          You're a{titleLead ? ` ${titleLead}` : ""}
        </Text>
        <MaskedView
          style={styles.resultTitleGradientMask}
          maskElement={<Text style={styles.resultTitleGradientText}>{titleAccent}</Text>}
        >
          <LinearGradient
            colors={["#7C45FF", "#C849FF", "#FF5EBA", "#FFB45F"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.resultTitleGradientFill}
          />
        </MaskedView>
      </View>

      <Text style={styles.insightSubtitle}>What you could build:</Text>

      <View style={styles.insightStack}>
        {insight.bullets.map((bullet, index) => {
          const accent = resultBulletAccents[index % resultBulletAccents.length];
          const entrance = cardEntrances[index];
          const opacity = entrance.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0, 0.9, 1] });
          const translateY = entrance.interpolate({ inputRange: [0, 1], outputRange: [34, 0] });
          const scale = entrance.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });

          return (
            <Animated.View key={bullet.text} style={[styles.insightRow, { opacity, transform: [{ translateY }, { scale }] }]}>
              <LinearGradient
                colors={["rgba(255, 255, 255, 0.09)", "rgba(137, 76, 255, 0.1)", "rgba(255, 255, 255, 0.035)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.insightRowFill}
              >
                <View pointerEvents="none" style={styles.insightRowGlow} />
                <View style={[styles.insightIcon, { backgroundColor: accent.glow, borderColor: accent.border, shadowColor: accent.color }]}>
                  <Ionicons name={bullet.icon} color={accent.color} size={26} />
                </View>
                <Text style={styles.insightText}>{bullet.text}</Text>
                <Ionicons name="chevron-forward" color="#C8AFFF" size={27} style={styles.insightChevron} />
              </LinearGradient>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}
