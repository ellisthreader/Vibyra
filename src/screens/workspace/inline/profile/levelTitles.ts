export type LevelRank = {
  name: string;
  tone: string;
};

const LEVEL_RANKS: Array<LevelRank & { level: number }> = [
  { level: 1, name: "Prompt Starter", tone: "Learning the shape of ideas" },
  { level: 2, name: "Prompt Tuner", tone: "Turning rough asks into output" },
  { level: 3, name: "Flow Prompter", tone: "Building useful prompt rhythm" },
  { level: 4, name: "Idea Builder", tone: "Shipping small sparks" },
  { level: 5, name: "Vibe Coder", tone: "Creating with momentum" },
  { level: 6, name: "Component Crafter", tone: "Making screens feel real" },
  { level: 7, name: "Feature Shaper", tone: "Turning briefs into behavior" },
  { level: 8, name: "Debug Fixer", tone: "Clearing blockers fast" },
  { level: 9, name: "Prototype Pilot", tone: "Testing ideas in motion" },
  { level: 10, name: "Prompt Architect", tone: "Designing stronger build paths" },
  { level: 12, name: "Interface Builder", tone: "Polishing the product surface" },
  { level: 13, name: "Professional Prompter", tone: "Commanding better outcomes" },
  { level: 15, name: "App Composer", tone: "Connecting features into apps" },
  { level: 18, name: "Build Strategist", tone: "Planning before the sprint" },
  { level: 20, name: "Senior Vibecoder", tone: "Shipping with consistency" },
  { level: 25, name: "Product Builder", tone: "Thinking like a maker" },
  { level: 30, name: "Workflow Architect", tone: "Automating the build loop" },
  { level: 35, name: "Launch Specialist", tone: "Preparing work for users" },
  { level: 40, name: "Automation Expert", tone: "Scaling repeated wins" },
  { level: 45, name: "AI Build Lead", tone: "Guiding complex agents" },
  { level: 50, name: "Master Vibecoder", tone: "Making ambitious ideas usable" },
  { level: 60, name: "Launch Engineer", tone: "Reliable from prompt to release" },
  { level: 75, name: "Principal Vibecoder", tone: "Owning the whole build flow" },
  { level: 100, name: "Vibyra Legend", tone: "A full-stack vibe builder" }
];

export function levelRankFor(level: number): LevelRank {
  let rank = LEVEL_RANKS[0];
  for (const item of LEVEL_RANKS) {
    if (level < item.level) break;
    rank = item;
  }
  return { name: rank.name, tone: rank.tone };
}

export function levelRankUnlockFor(level: number): LevelRank | null {
  const rank = LEVEL_RANKS.find((item) => item.level === level);
  return rank ? { name: rank.name, tone: rank.tone } : null;
}
