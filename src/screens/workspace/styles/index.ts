import { part1 } from "./part1";
import { part2 } from "./part2";
import { part3 } from "./part3";
import { part4 } from "./part4";
import { part5 } from "./part5";
import { part6 } from "./part6";
import { part7 } from "./part7";
import { part8 } from "./part8";
import { part9 } from "./part9";
import { part10 } from "./part10";
import { part11 } from "./part11";
import { part12 } from "./part12";
import { part13 } from "./part13";
import { part14 } from "./part14";
import { part15 } from "./part15";
import { part16 } from "./part16";
import { part17 } from "./part17";
import { part18 } from "./part18";
import { part19 } from "./part19";
import { part20 } from "./part20";
import { part21 } from "./part21";
import { part22 } from "./part22";
import { part23 } from "./part23";
import { part24 } from "./part24";
import { part25 } from "./part25";
import { part26 } from "./part26";
import { part27 } from "./part27";
import { part28 } from "./part28";
import { part29 } from "./part29";
import { part30 } from "./part30";
import { part31 } from "./part31";
import { part32 } from "./part32";
import { part33 } from "./part33";
import { part34 } from "./part34";
import { part35 } from "./part35";
import { part36 } from "./part36";
import { part37 } from "./part37";
import { part38 } from "./part38";
import { part39 } from "./part39";
import { part40 } from "./part40";
import { part41 } from "./part41";
import { part42 } from "./part42";
import { part43 } from "./part43";
import { part44 } from "./part44";
import { part45 } from "./part45";
import { part46 } from "./part46";
import { part47 } from "./part47";
import { part48 } from "./part48";
import { part49 } from "./part49";
import { part50 } from "./part50";
import { part51 } from "./part51";
import { part52 } from "./part52";
import { part53 } from "./part53";
import { part54 } from "./part54";
import { part55 } from "./part55";
import { part56 } from "./part56";
import { part57 } from "./part57";
import { part58 } from "./part58";
import { part59 } from "./part59";
import { part60 } from "./part60";
import { part61 } from "./part61";
import { part62 } from "./part62";
import { createThemedStyleSheet, setThemeTransformScheme } from "./themeTransform";

const rawDark = {
  ...part1, ...part2, ...part3, ...part4, ...part5, ...part6, ...part7, ...part8,
  ...part9, ...part10, ...part11, ...part12, ...part13, ...part14, ...part15, ...part16,
  ...part17, ...part18, ...part19, ...part20, ...part21, ...part22, ...part23, ...part24,
  ...part25, ...part26, ...part27, ...part28, ...part29, ...part30, ...part31, ...part32,
  ...part33, ...part34, ...part35, ...part36, ...part37, ...part38, ...part39,
  ...part40, ...part41, ...part42, ...part43, ...part44, ...part45, ...part46, ...part47, ...part48, ...part49, ...part50, ...part51, ...part52, ...part53, ...part54, ...part55, ...part56, ...part57, ...part58, ...part59, ...part60, ...part61, ...part62
} as Record<string, Record<string, unknown>>;

export function setStylesScheme(scheme: "dark" | "light") {
  setThemeTransformScheme(scheme);
}

export const styles: any = createThemedStyleSheet(rawDark);
