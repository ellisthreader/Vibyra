import { scaffoldFreeName, scaffoldPreflight } from "../ipc/scaffold";
import { allRequiredTools } from "./projectTemplates";

export interface OpeningAnswers {
  /** Which of the catalog's toolchains are on PATH. */
  tools(installed: Record<string, boolean>): void;
  /** A project name whose folder is genuinely free. */
  name(free: string): void;
}

/**
 * What the wizard asks the native side while its first screen is being drawn.
 *
 * Both answers are optional in the sense that matters: if either call fails the
 * wizard still works, because the build checks the same things again. The name
 * is worth asking for because only this side can see the disk — the renderer's
 * own suggestion knows the projects this window has, not the folder an
 * abandoned build left behind under exactly that name.
 */
export function askOnOpen(parent: string, suggestion: string, answers: OpeningAnswers): void {
  void scaffoldPreflight(allRequiredTools()).then(answers.tools).catch(() => {});
  void scaffoldFreeName(parent, suggestion).then(answers.name).catch(() => {});
}
