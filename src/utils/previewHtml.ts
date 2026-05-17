export function hasLocalPreviewDependencies(html: string) {
  return /<script\b[^>]*\bsrc\s*=\s*["'](?!https?:|data:|blob:|\/\/|about:)[^"']+["']/i.test(html)
    || /<link\b(?=[^>]*\brel\s*=\s*["']?(?:stylesheet|modulepreload|preload))(?=[^>]*\bhref\s*=\s*["'](?!https?:|data:|\/\/|about:))[^>]*>/i.test(html);
}
