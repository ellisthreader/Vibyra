export function parseStrictJson(text) {
  const source = String(text);
  let index = 0;

  const skipSpace = () => {
    while (/\s/.test(source[index] || "")) index += 1;
  };
  const parseString = () => {
    const start = index;
    if (source[index++] !== '"') throw new SyntaxError("Expected a JSON string.");
    while (index < source.length) {
      if (source[index] === "\\") {
        index += 2;
        continue;
      }
      if (source[index++] === '"') return JSON.parse(source.slice(start, index));
    }
    throw new SyntaxError("Unterminated JSON string.");
  };
  const parseValue = () => {
    skipSpace();
    if (source[index] === "{") return parseObject();
    if (source[index] === "[") return parseArray();
    if (source[index] === '"') {
      parseString();
      return;
    }
    const match = source.slice(index).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
    if (!match) throw new SyntaxError("Invalid JSON value.");
    index += match[0].length;
  };
  const parseObject = () => {
    index += 1;
    skipSpace();
    const keys = new Set();
    if (source[index] === "}") {
      index += 1;
      return;
    }
    while (index < source.length) {
      skipSpace();
      const key = parseString();
      if (keys.has(key)) throw new SyntaxError(`Duplicate JSON key: ${key}`);
      keys.add(key);
      skipSpace();
      if (source[index++] !== ":") throw new SyntaxError("Expected ':' after JSON key.");
      parseValue();
      skipSpace();
      if (source[index] === "}") {
        index += 1;
        return;
      }
      if (source[index++] !== ",") throw new SyntaxError("Expected ',' in JSON object.");
    }
    throw new SyntaxError("Unterminated JSON object.");
  };
  const parseArray = () => {
    index += 1;
    skipSpace();
    if (source[index] === "]") {
      index += 1;
      return;
    }
    while (index < source.length) {
      parseValue();
      skipSpace();
      if (source[index] === "]") {
        index += 1;
        return;
      }
      if (source[index++] !== ",") throw new SyntaxError("Expected ',' in JSON array.");
    }
    throw new SyntaxError("Unterminated JSON array.");
  };

  parseValue();
  skipSpace();
  if (index !== source.length) throw new SyntaxError("Unexpected data after JSON value.");
  return JSON.parse(source);
}
