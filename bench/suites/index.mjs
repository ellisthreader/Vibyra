import knowledge from "./knowledge.mjs";
import math from "./math.mjs";
import code from "./code.mjs";
import instruct from "./instruct.mjs";

// The Vibyra Index is the plain average of these suites (each 0–100), so no
// single test dominates and a new suite changes the weights transparently.
export const SUITES = { code, math, knowledge, instruct };
export const INDEX_SUITES = ["code", "math", "knowledge", "instruct"];
