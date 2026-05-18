const CATEGORY_RULES = [
  {
    label: "a restaurant ordering and operations platform",
    kindId: "custom",
    kindLabel: "Restaurant platform",
    threshold: 10,
    requiredEvidence: ["food or venue terms"],
    rules: [
      rule(/\b(restaurant|restaurants|cafe|cafes|bistro|takeaway|dining|food|foods|meal|meals|dish|dishes|cuisine|allergen|allergens|chef|chefs)\b/g, 4, "food or venue terms"),
      rule(/\b(reservations?|table booking|kitchen|menus?|till|orders?|payment|staff|reports?)\b/g, 2, "restaurant operations"),
      rule(/\b(delivery drivers?|driver locations?|live orders?|settle payment|kitchen status)\b/g, 4, "delivery and kitchen workflow")
    ]
  },
  {
    label: "a travel or booking website",
    kindId: "website",
    kindLabel: "Travel website",
    threshold: 7,
    requiredEvidence: ["flight terms"],
    rules: [
      rule(/\b(flights?|airlines?|airports?|passengers?|boarding|departures?|arrivals?)\b/g, 3, "flight terms"),
      rule(/\b(book flights?|flight booking|check-?in|tickets?)\b/g, 4, "booking flow")
    ]
  },
  {
    label: "an ecommerce website",
    kindId: "website",
    kindLabel: "Ecommerce website",
    threshold: 8,
    rules: [
      rule(/\b(products?|shop|storefront|catalog|cart|checkout|payment|orders?)\b/g, 2, "commerce flow"),
      rule(/\b(add to cart|product detail|shipping|discount|inventory)\b/g, 4, "shopping features")
    ]
  },
  {
    label: "a SaaS dashboard or business tool",
    kindId: "saas",
    kindLabel: "SaaS product",
    threshold: 8,
    rules: [
      rule(/\b(dashboard|analytics|billing|subscription|team|admin|reports?|metrics?)\b/g, 2, "dashboard features"),
      rule(/\b(role|permissions?|staff|workflow|management)\b/g, 2, "business workflow")
    ]
  },
  {
    label: "a portfolio website",
    kindId: "website",
    kindLabel: "Portfolio website",
    threshold: 8,
    rules: [
      rule(/\b(portfolio|case stud(?:y|ies)|resume|curriculum vitae|selected work|my work)\b/g, 5, "portfolio copy"),
      rule(/\b(projects?|skills?|experience|about me|contact|hire me|github|linkedin|testimonials?)\b/g, 2, "portfolio sections")
    ]
  },
  {
    label: "an AI tool",
    kindId: "ai-tool",
    kindLabel: "AI tool",
    threshold: 7,
    rules: [rule(/\b(chat|prompt|model|openai|agent|assistant|copilot)\b/g, 2, "AI terms")]
  },
  {
    label: "a game or interactive experience",
    kindId: "game",
    kindLabel: "Game",
    threshold: 12,
    rules: [
      rule(/\b(game|gameplay|score|level|player|enemy|sprite|canvas)\b/g, 2, "game terms"),
      rule(/\b(phaser|three\.js|webgl)\b/g, 4, "game engine")
    ]
  }
];

export function detectProjectPurpose(scan) {
  const contentText = scan.snippets.join("\n").slice(0, 50000).toLowerCase();
  const descriptionText = (scan.descriptions ?? []).join(" ").toLowerCase();
  const pathText = scan.evidence.join(" ").toLowerCase();
  const titleText = scan.titles.slice(1).join(" ").toLowerCase();
  const rootText = String(scan.rootName ?? "").toLowerCase();
  const results = CATEGORY_RULES
    .map((category) => scoreCategory(category, contentText, descriptionText, pathText, titleText, rootText))
    .filter((result) => result.score >= result.threshold && hasRequiredEvidence(result))
    .sort((a, b) => b.score - a.score);

  const best = results[0];
  if (!best) return null;
  return {
    confidence: best.score >= best.threshold + 8 ? "high" : "medium",
    evidence: best.evidence,
    kindId: best.kindId,
    kindLabel: best.kindLabel,
    label: best.label
  };
}

export function purposeFromText(text) {
  return detectProjectPurpose({ descriptions: [], evidence: [], rootName: "", snippets: [text], titles: [] })?.label ?? "";
}

function scoreCategory(category, contentText, descriptionText, pathText, titleText, rootText) {
  let score = 0;
  const evidence = [];
  for (const item of category.rules) {
    const contentHits = cappedMatches(contentText, item.pattern, 8);
    const descriptionHits = cappedMatches(descriptionText, item.pattern, 4);
    const titleHits = cappedMatches(titleText, item.pattern, 3);
    const pathHits = cappedMatches(pathText, item.pattern, 4);
    const rootHits = cappedMatches(rootText, item.pattern, 2);
    const weighted = (contentHits * item.weight) + (descriptionHits * item.weight * 3) + (titleHits * 3) + (pathHits * 0.5) + (rootHits * 0.25);
    if (weighted > 0) {
      score += weighted;
      if (!evidence.includes(item.evidence)) evidence.push(item.evidence);
    }
  }
  return { ...category, evidence, score };
}

function hasRequiredEvidence(result) {
  return !result.requiredEvidence?.length
    || result.requiredEvidence.some((evidence) => result.evidence.includes(evidence));
}

function cappedMatches(text, pattern, max) {
  pattern.lastIndex = 0;
  return Math.min(Array.from(text.matchAll(pattern)).length, max);
}

function rule(pattern, weight, evidence) {
  return { evidence, pattern, weight };
}
