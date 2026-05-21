import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePreferences } from "../../../context/PreferencesContext";
import type { DeepResearchPlanDraft } from "../../../types/chatTools";

export function buildDeepResearchPlan(prompt: string): DeepResearchPlanDraft {
  const clean = prompt.replace(/^\/research\b/i, "").trim();
  const subject = clean.replace(/\s+/g, " ").replace(/[?.!]+$/, "");
  const title = titleFromPrompt(subject || "Deep research");
  const context = planContext(subject || "the topic");
  return {
    title,
    steps: [
      `Collect ${context.sources} for ${context.topic}.`,
      `Extract ${context.evidence} from the strongest and most recent sources.`,
      `Analyse ${context.analysis} and separate confirmed findings from uncertainty.`,
      `Correlate ${context.relationships} to identify what matters most.`,
      `Summarise ${context.output} with source-backed recommendations.`
    ]
  };
}

export function formatDeepResearchPlanForChat(prompt: string, plan: DeepResearchPlanDraft) {
  return `${prompt.trim()}\n\nDeep Research plan: ${plan.title}\n${plan.steps.map((step) => `- ${step}`).join("\n")}`;
}

export type DeepResearchPlanPreview = {
  countdown: number;
  loading: boolean;
  onCancel: () => void;
  onEdit: () => void;
  onStart: () => void;
  plan: DeepResearchPlanDraft | null;
};

export function DeepResearchPlanCard({
  countdown,
  loading = false,
  onCancel,
  onEdit,
  onStart,
  plan,
}: {
  countdown: number;
  loading?: boolean;
  onCancel: () => void;
  onEdit: () => void;
  onStart: () => void;
  plan: DeepResearchPlanDraft | null;
}) {
  const prefs = usePreferences();
  if (!plan && !loading) return null;
  const palette = prefs.colors;
  return (
    <View style={[localStyles.card, { backgroundColor: palette.elevated, borderColor: "rgba(168, 85, 247, 0.28)" }]}>
      <View style={localStyles.header}>
        <View style={localStyles.icon}>
          <Ionicons name="search-outline" color="#EDE2FF" size={16} />
        </View>
        <View style={localStyles.titleBlock}>
          <Text style={[localStyles.kicker, { color: "#C4B5FD" }]}>Deep Research plan</Text>
          <Text style={[localStyles.title, { color: palette.text }]}>{loading ? "Creating plan..." : plan?.title}</Text>
        </View>
      </View>
      {loading ? (
        <Text style={[localStyles.loadingText, { color: palette.dim }]}>Building a topic-specific plan before research starts.</Text>
      ) : plan ? (
        <>
          <View style={localStyles.steps}>
            {plan.steps.map((step) => (
              <View key={step} style={localStyles.stepRow}>
                <Text style={localStyles.stepBullet}>•</Text>
                <Text style={[localStyles.stepText, { color: palette.text }]}>{step}</Text>
              </View>
            ))}
          </View>
          <Text style={[localStyles.timer, { color: palette.dim }]}>Starts in {countdown}s</Text>
          <View style={localStyles.actions}>
            <Pressable onPress={onEdit} style={({ pressed }) => [localStyles.secondaryButton, { borderColor: palette.border }, pressed && localStyles.pressed]}>
              <Text style={[localStyles.secondaryText, { color: palette.text }]}>Edit</Text>
            </Pressable>
            <Pressable onPress={onCancel} style={({ pressed }) => [localStyles.secondaryButton, { borderColor: palette.border }, pressed && localStyles.pressed]}>
              <Text style={[localStyles.secondaryText, { color: palette.text }]}>Cancel</Text>
            </Pressable>
            <Pressable onPress={onStart} style={({ pressed }) => [localStyles.startButton, pressed && localStyles.pressed]}>
              <Text style={localStyles.startText}>Start</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );
}

function titleFromPrompt(value: string) {
  const words = value.split(/\s+/).filter(Boolean).slice(0, 7);
  const raw = words.length > 0 ? words.join(" ") : "Deep research";
  return raw
    .split(" ")
    .map((word) => word.toLowerCase() === "uk" ? "UK" : word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function planContext(subject: string) {
  const lower = subject.toLowerCase();
  const bestQuery = /\b(best|top|recommend|which|choose|right|suitable)\b/i.test(subject);
  const dogBreedQuery = /\b(dog|dogs|puppy|puppies|breed|breeds|canine)\b/i.test(subject);
  if (bestQuery && dogBreedQuery) {
    return dogBreedPlan(subject, /\b(uk|britain|british|england|scotland|wales|northern ireland)\b/i.test(subject));
  }
  if (bestQuery) {
    return recommendationPlan(subject);
  }

  const words = importantWords(lower);
  const topic = subject;
  const hasPay = /\b(pay|salary|wage|compensation|income|price|cost|£|\$)\b/i.test(subject);
  const hasMarket = /\b(market|competitor|startup|business|industry|product|customer)\b/i.test(subject);
  const hasTrend = /\b(trend|growth|decline|forecast|future|recent|year|202[0-9])\b/i.test(subject);
  const hasTechnical = /\b(code|software|api|model|ai|app|framework|developer|skill)\b/i.test(subject);
  const hasNames = /\b(name|names|baby names|popular names)\b/i.test(subject);
  if (hasNames) {
    return namesPlan(subject, /\b(uk|britain|british|england|scotland|wales|northern ireland)\b/i.test(subject));
  }
  const keywordFocus = words.slice(0, 5).join(", ") || "the requested subject";

  return {
    topic,
    sources: hasPay
      ? `current wage, pricing, hiring, and public dataset evidence related to ${keywordFocus}`
      : hasMarket
        ? `market, competitor, customer, and industry evidence related to ${keywordFocus}`
        : `recent primary and reputable secondary sources related to ${keywordFocus}`,
    evidence: hasPay
      ? "salary ranges, pay drivers, sample sizes, dates, and regional differences"
      : hasTechnical
        ? "technical claims, adoption signals, benchmarks, limitations, and source dates"
        : "key facts, dates, figures, definitions, and source credibility signals",
    analysis: hasTrend
      ? "growth, decline, timing, outliers, and the causes behind recent changes"
      : hasMarket
        ? "positioning, demand signals, risks, and practical trade-offs"
        : "patterns, disagreements, missing evidence, and practical implications",
    relationships: hasPay
      ? "skills, demand, experience level, geography, and median pay"
      : hasTechnical
        ? "capabilities, constraints, adoption, cost, and reliability"
        : "causes, evidence strength, stakeholder impact, and likely outcomes",
    output: hasPay
      ? "high-value opportunities, declining areas, and pay-aware next steps"
      : hasMarket
        ? "opportunities, threats, evidence gaps, and next actions"
        : "the most useful findings, caveats, and next actions"
  };
}

function dogBreedPlan(subject: string, ukSpecific: boolean) {
  const region = ukSpecific ? "UK-specific " : "";
  return {
    topic: subject,
    sources: `${region}breed guidance from kennel, welfare, vet, insurance, rescue, and owner-safety sources`,
    evidence: "temperament, exercise needs, grooming, size, lifespan, health risks, insurance/vet costs, and legal or housing constraints",
    analysis: "which breeds fit different homes, first-time owners, families, flats, active lifestyles, allergies, and time limits",
    relationships: "owner lifestyle, space, budget, children, work hours, training needs, and breed health risks",
    output: "a shortlist of best-fit breeds by scenario, plus breeds to avoid when common constraints apply"
  };
}

function recommendationPlan(subject: string) {
  return {
    topic: subject,
    sources: `independent reviews, expert guidance, recent comparisons, and user outcome evidence for ${subject}`,
    evidence: "selection criteria, strengths, weaknesses, costs, risks, and who each option suits",
    analysis: "where recommendations agree or conflict and which assumptions change the best choice",
    relationships: "user needs, constraints, trade-offs, evidence quality, and likely outcomes",
    output: "ranked options by use case, clear caveats, and a practical final recommendation"
  };
}

function namesPlan(subject: string, ukSpecific: boolean) {
  const region = ukSpecific ? "UK " : "";
  return {
    topic: subject,
    sources: `official ${region}baby name datasets, national statistics releases, and recent naming trend analysis`,
    evidence: "rankings, counts, spelling variants, regional differences, age-group patterns, and publication dates",
    analysis: "which names are rising, falling, stable, or newly entering the top rankings",
    relationships: "regions, demographics, cultural moments, media influence, and longer-term popularity cycles",
    output: "the strongest naming trends, caveats in the data, and practical takeaways for choosing names"
  };
}

function importantWords(value: string) {
  const stop = new Set(["analyse", "anaylse", "best", "what", "which", "with", "that", "this", "from", "into", "about", "please", "research", "deep", "find"]);
  return value
    .split(/[^a-z0-9£$%.-]+/)
    .filter((word) => word.length > 2 && !stop.has(word));
}

const localStyles = StyleSheet.create({
  actions: { flexDirection: "row", gap: 8, marginTop: 14 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    padding: 13,
    width: "100%"
  },
  header: { alignItems: "center", flexDirection: "row", gap: 12 },
  icon: {
    alignItems: "center",
    backgroundColor: "rgba(124, 58, 237, 0.16)",
    borderColor: "rgba(196, 181, 253, 0.24)",
    borderRadius: 11,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  kicker: { fontSize: 11, fontWeight: "900", letterSpacing: 0, lineHeight: 15, textTransform: "uppercase" },
  loadingText: { fontSize: 12.5, fontWeight: "700", lineHeight: 18, marginTop: 10 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  secondaryButton: { alignItems: "center", borderRadius: 9, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 38 },
  secondaryText: { fontSize: 13, fontWeight: "900", lineHeight: 17 },
  startButton: { alignItems: "center", backgroundColor: "#7C3AED", borderRadius: 9, flex: 1, justifyContent: "center", minHeight: 38 },
  startText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900", lineHeight: 17 },
  stepRow: { flexDirection: "row", gap: 10 },
  stepBullet: { color: "#A855F7", fontSize: 16, fontWeight: "900", lineHeight: 19, marginTop: -1 },
  stepText: { flex: 1, fontSize: 12.5, fontWeight: "700", lineHeight: 18 },
  steps: { gap: 8, marginTop: 13 },
  timer: { fontSize: 12, fontWeight: "800", lineHeight: 16, marginTop: 12 },
  title: { fontSize: 15, fontWeight: "900", lineHeight: 20 },
  titleBlock: { flex: 1, minWidth: 0 }
});
