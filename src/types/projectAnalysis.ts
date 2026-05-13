import type { ProjectBrief } from "./domain";

export type ProjectAnalysis = {
  confidence: "low" | "medium" | "high";
  evidence: string[];
  filesSampled: number;
  foldersScanned: number;
  summary: string;
  techEvidence?: string[];
};

export type ProjectBriefSetupPrompt = {
  analysis?: ProjectAnalysis;
  detectedBrief?: ProjectBrief | null;
  projectId: string;
  projectName: string;
  status: "analyzing" | "ready" | "confirmed";
};
