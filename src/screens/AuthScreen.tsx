import { Ionicons } from "@expo/vector-icons";
import MaskedView from "@react-native-masked-view/masked-view";
import { Asset } from "expo-asset";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { VibyraLogo } from "../components/VibyraLogo";
import { useAppContext } from "../context/AppContext";
import { colors } from "../styles/theme";

type AuthMethod = "apple" | "google" | "email";
type IconName = keyof typeof Ionicons.glyphMap;
const frontPageBackground = require("../assets/front-auth.jpg");
const logoAspectRatio = 515 / 375;

const featureItems = [
  { title: "Beautiful", body: "by design", symbol: "braces" },
  { title: "Fast", body: "by nature", icon: "flash-outline" },
  { title: "Code", body: "anywhere", icon: "globe-outline" }
] satisfies Array<{ title: string; body: string; symbol?: "braces"; icon?: IconName }>;

export function AuthScreen() {
  const app = useAppContext();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [backgroundSource, setBackgroundSource] = useState(() => frontPageBackground);
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const logoTranslateY = useRef(new Animated.Value(-120)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(20)).current;
  const restOpacity = useRef(new Animated.Value(0)).current;
  const restTranslateY = useRef(new Animated.Value(28)).current;
  const availableHeight = height - insets.top - insets.bottom;
  const fitScale = Math.min(1, Math.max(0.82, availableHeight / 790));
  const compact = availableHeight < 735;
  const logoWidth = Math.min(width * (compact ? 0.51 : 0.58), 250) * fitScale;
  const titleFontSize = Math.min(width * (compact ? 0.075 : 0.082), 34) * Math.max(fitScale, 0.88);
  const contentSpacing = useMemo(() => ({
    paddingBottom: Math.max(insets.bottom + 8, compact ? 10 : 22),
    paddingTop: Math.max(insets.top + (compact ? 42 : 78), availableHeight * (compact ? 0.075 : 0.115))
  }), [availableHeight, compact, insets.bottom, insets.top]);

  useEffect(() => {
    let cancelled = false;

    async function loadBackground() {
      const asset = Asset.fromModule(frontPageBackground);
      if (!asset.localUri) {
        await asset.downloadAsync();
      }
      if (!cancelled && asset.localUri) {
        setBackgroundSource({ uri: asset.localUri });
      }
    }

    loadBackground().catch(() => {
      // Keep the static require fallback if the asset resolver fails.
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const logoEntrance = Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 8,
        tension: 44,
        useNativeDriver: true
      }),
      Animated.timing(logoTranslateY, {
        toValue: 0,
        duration: 1100,
        easing: Easing.bezier(0.2, 0.92, 0.2, 1),
        useNativeDriver: true
      })
    ]);

    const titleEntrance = Animated.parallel([
      Animated.timing(titleOpacity, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(titleTranslateY, {
        toValue: 0,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      })
    ]);

    const restEntrance = Animated.parallel([
      Animated.timing(restOpacity, {
        toValue: 1,
        duration: 720,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(restTranslateY, {
        toValue: 0,
        duration: 760,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true
      })
    ]);

    logoEntrance.start(() => {
      titleEntrance.start(() => {
        restEntrance.start();
      });
    });
  }, [logoOpacity, logoScale, logoTranslateY, titleOpacity, titleTranslateY, restOpacity, restTranslateY]);

  return (
    <SafeAreaView edges={[]} style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.screen}>
        <Image source={backgroundSource} resizeMode="cover" style={styles.backgroundImage} />
        <LinearGradient colors={["rgba(3, 2, 18, 0.12)", "rgba(7, 3, 26, 0.2)", "rgba(2, 1, 14, 0.48)"]} style={styles.backgroundOverlay} />
        <View style={[styles.content, contentSpacing]}>
          <View style={styles.heroStack}>
            <Animated.View
              style={[
                styles.logoStage,
                {
                  opacity: logoOpacity,
                  transform: [{ translateY: logoTranslateY }, { scale: logoScale }]
                }
              ]}
            >
              <VibyraLogo style={{ height: logoWidth / logoAspectRatio, width: logoWidth }} />
            </Animated.View>
            <Animated.View
              style={[
                styles.titleStage,
                {
                  opacity: titleOpacity,
                  marginTop: 32 * fitScale,
                  transform: [{ translateY: titleTranslateY }]
                }
              ]}
            >
              <View style={styles.titleRow}>
                <Text style={[styles.title, { fontSize: titleFontSize, lineHeight: titleFontSize * 1.16 }]}>Welcome to </Text>
                <GradientTitleWord fontSize={titleFontSize} text="Vibyra" />
              </View>
            </Animated.View>
          </View>

          <Animated.View
            style={[
              styles.actions,
              {
                gap: 11 * fitScale,
                opacity: restOpacity,
                transform: [{ translateY: restTranslateY }]
              }
            ]}
          >
            <FeatureStrip scale={fitScale} />
            <AuthChoice
              icon="logo-google"
              label="Continue with Google"
              method="google"
              scale={fitScale}
              onSelect={(method) => app.authenticateWith(method, "new")}
            />
            <AuthChoice
              icon="logo-apple"
              label="Continue with Apple"
              method="apple"
              scale={fitScale}
              onSelect={(method) => app.authenticateWith(method, "new")}
            />
            <AuthChoice
              icon="mail-outline"
              label="Continue with email"
              method="email"
              scale={fitScale}
              onSelect={(method) => app.authenticateWith(method, "new")}
            />
            <View style={[styles.legalBlock, { gap: 14 * fitScale, paddingTop: 21 * fitScale }]}>
              <Text style={[styles.legalIntro, { fontSize: 14 * fitScale, lineHeight: 20 * fitScale }]}>By continuing, you agree to our</Text>
              <View style={[styles.legalRow, { gap: 24 * fitScale }]}>
                <Pressable style={({ pressed }) => pressed ? styles.legalPressed : null}>
                  <Text style={[styles.legalLink, { fontSize: 15 * fitScale, lineHeight: 20 * fitScale }]}>Privacy Policy</Text>
                </Pressable>
                <View style={[styles.legalDivider, { height: 26 * fitScale }]} />
                <Pressable style={({ pressed }) => pressed ? styles.legalPressed : null}>
                  <Text style={[styles.legalLink, { fontSize: 15 * fitScale, lineHeight: 20 * fitScale }]}>Terms of Service</Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </View>
      </View>
    </SafeAreaView>
  );
}

function GradientTitleWord({ fontSize, text }: { fontSize: number; text: string }) {
  const titleStyle = [styles.title, { fontSize, lineHeight: fontSize * 1.16 }];

  return (
    <MaskedView maskElement={<Text style={titleStyle}>{text}</Text>} style={{ height: fontSize * 1.2, width: fontSize * 3.23 }}>
      <LinearGradient
        colors={["#FFFFFF", "#C65BFF", "#FF38C5", "#FFB24A"]}
        locations={[0, 0.34, 0.68, 1]}
        start={{ x: 0, y: 0.48 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.gradientTitleFill}
      />
    </MaskedView>
  );
}

function FeatureStrip({ scale }: { scale: number }) {
  const iconTileSize = 56 * scale;
  const iconSize = 32 * scale;
  const featureTitleSize = 17 * scale;
  const featureBodySize = 15 * scale;

  return (
    <View style={[styles.featureStrip, { marginBottom: 27 * scale }]}>
      {featureItems.map((item, index) => (
        <React.Fragment key={item.title}>
          <View style={styles.featureItem}>
            <LinearGradient
              colors={["rgba(176, 65, 255, 0.38)", "rgba(83, 26, 154, 0.54)"]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={[styles.featureIconTile, { borderRadius: 20 * scale, height: iconTileSize, marginBottom: 11 * scale, width: iconTileSize }]}
            >
              {item.symbol === "braces" ? (
                <Text style={[styles.bracesIcon, { fontSize: 30 * scale, lineHeight: 36 * scale }]}>{"{ }"}</Text>
              ) : (
                <Ionicons name={item.icon} size={iconSize} color="#B15BFF" />
              )}
            </LinearGradient>
            <Text style={[styles.featureTitle, { fontSize: featureTitleSize, lineHeight: featureTitleSize * 1.35 }]}>{item.title}</Text>
            <Text style={[styles.featureBody, { fontSize: featureBodySize, lineHeight: featureBodySize * 1.4 }]}>{item.body}</Text>
          </View>
          {index < featureItems.length - 1 ? <View style={[styles.featureDivider, { height: 64 * scale, marginTop: 16 * scale }]} /> : null}
        </React.Fragment>
      ))}
    </View>
  );
}

function AuthChoice({
  icon,
  label,
  method,
  scale,
  onSelect
}: {
  icon: IconName;
  label: string;
  method: AuthMethod;
  scale: number;
  onSelect: (method: AuthMethod) => void;
}) {
  const buttonHeight = Math.max(48, 56 * scale);
  const labelSize = Math.max(14.5, 17 * scale);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.authChoice,
        {
          gap: 28 * scale,
          height: buttonHeight,
          paddingHorizontal: 24 * scale
        },
        pressed ? styles.authChoicePressed : null
      ]}
      onPress={() => onSelect(method)}
    >
      <AuthProviderIcon icon={icon} method={method} scale={scale} />
      <Text style={[styles.authChoiceText, { fontSize: labelSize, minWidth: 190 * scale }]}>{label}</Text>
    </Pressable>
  );
}

function AuthProviderIcon({ icon, method, scale }: { icon: IconName; method: AuthMethod; scale: number }) {
  const iconBoxWidth = 40 * scale;

  if (method === "google") {
    return (
      <View style={[styles.googleIcon, { height: 34 * scale, width: iconBoxWidth }]}>
        <Svg width={30 * scale} height={30 * scale} viewBox="0 0 24 24">
          <Path fill="#4285F4" d="M23.49 12.27c0-.84-.08-1.65-.21-2.43H12v4.6h6.45a5.52 5.52 0 0 1-2.39 3.62v3.01h3.88c2.27-2.09 3.55-5.17 3.55-8.8Z" />
          <Path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.93l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.27v3.1A11.99 11.99 0 0 0 12 24Z" />
          <Path fill="#FBBC05" d="M5.28 14.26A7.21 7.21 0 0 1 4.9 12c0-.78.13-1.54.38-2.26v-3.1H1.27A11.93 11.93 0 0 0 0 12c0 1.94.46 3.78 1.27 5.36l4.01-3.1Z" />
          <Path fill="#EA4335" d="M12 4.79c1.76 0 3.34.61 4.59 1.8l3.43-3.43A11.46 11.46 0 0 0 12 0 11.99 11.99 0 0 0 1.27 6.64l4.01 3.1C6.23 6.9 8.88 4.79 12 4.79Z" />
        </Svg>
      </View>
    );
  }

  return (
    <Ionicons
      name={icon}
      size={(method === "apple" ? 35 : 31) * scale}
      color={method === "apple" ? "#FFFFFF" : "#A855FF"}
      style={[styles.authIcon, { width: iconBoxWidth }]}
    />
  );
}

const styles = StyleSheet.create({
  actions: {
    alignSelf: "center",
    gap: 11,
    paddingBottom: 0,
    width: "92.5%"
  },
  authChoice: {
    alignItems: "center",
    backgroundColor: "rgba(12, 5, 35, 0.34)",
    borderColor: "rgba(176, 70, 255, 0.82)",
    borderRadius: 999,
    borderWidth: 1.2,
    flexDirection: "row",
    gap: 28,
    height: 56,
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: 24,
    shadowColor: "#B141FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    width: "100%"
  },
  authChoicePressed: {
    backgroundColor: "rgba(40, 17, 78, 0.62)",
    borderColor: "rgba(205, 103, 255, 0.94)",
    transform: [{ scale: 0.99 }]
  },
  authChoiceText: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
    minWidth: 190
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    height: undefined,
    opacity: 1,
    width: undefined
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject
  },
  bracesIcon: {
    color: "#C77AFF",
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 36
  },
  authIcon: {
    textAlign: "center",
    width: 40
  },
  content: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 22
  },
  featureBody: {
    color: "rgba(223, 212, 255, 0.74)",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21,
    textAlign: "center"
  },
  featureDivider: {
    backgroundColor: "rgba(144, 75, 255, 0.24)",
    height: 64,
    marginTop: 16,
    width: 1
  },
  featureIconTile: {
    alignItems: "center",
    borderColor: "rgba(199, 98, 255, 0.36)",
    borderRadius: 20,
    borderWidth: 1,
    height: 56,
    justifyContent: "center",
    marginBottom: 11,
    shadowColor: "#B141FF",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    width: 56
  },
  featureItem: {
    alignItems: "center",
    flex: 1
  },
  featureStrip: {
    alignItems: "flex-start",
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 27,
    width: "96%"
  },
  featureTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 23,
    textAlign: "center"
  },
  gradientTitleFill: {
    height: "100%",
    minWidth: 112
  },
  heroStack: {
    alignItems: "center",
    gap: 0
  },
  legalBlock: {
    alignItems: "center",
    gap: 14,
    paddingTop: 21
  },
  legalDivider: {
    backgroundColor: "rgba(212, 194, 255, 0.52)",
    height: 26,
    width: 1
  },
  legalIntro: {
    color: "rgba(222, 213, 245, 0.62)",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    textAlign: "center"
  },
  legalLink: {
    color: "#A855FF",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20
  },
  legalPressed: {
    opacity: 0.65
  },
  legalRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 24,
    justifyContent: "center",
    paddingTop: 0
  },
  googleIcon: {
    alignItems: "center",
    height: 34,
    justifyContent: "center",
    width: 40
  },
  logoStage: {
    alignItems: "center",
    justifyContent: "center"
  },
  screen: { backgroundColor: colors.background, flex: 1 },
  title: {
    color: colors.text,
    fontWeight: "900",
    letterSpacing: 0,
    textAlign: "center"
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center"
  },
  titleStage: {
    marginTop: 32
  }
});
