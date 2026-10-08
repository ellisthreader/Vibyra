import type { ReactNode } from "react";

const WORDS =
  "const|let|function|return|import|from|export|async|await|if|else|pub|fn|use|struct|def|class|true|false|null";
const TOKENS = new RegExp(
  `("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|//[^\\n]*|\\b(?:${WORDS})\\b|\\b\\d+\\b)`,
  "g",
);
const KEYWORD = new RegExp(`^(?:${WORDS})$`);

/** Four tokens on purpose. Syntax colour is the one documented exception to the
 *  graphite/cobalt rule, and a real grammar would spend far more than it earns
 *  on the handful of lines a reply actually quotes. */
export function highlight(code: string): ReactNode {
  return code.split(TOKENS).map((part, index) => (
    <span
      key={index}
      className={
        /^["']/.test(part)
          ? "syntax-string"
          : part.startsWith("//")
            ? "syntax-comment"
            : KEYWORD.test(part)
              ? "syntax-keyword"
              : /^\d+$/.test(part)
                ? "syntax-number"
                : undefined
      }
    >
      {part}
    </span>
  ));
}
