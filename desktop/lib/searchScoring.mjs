export function projectSearchScore(project, query) {
  const needle = normalizeSearchText(query);
  if (!needle) return 0;

  const name = normalizeSearchText(project?.name);
  const path = normalizeSearchText(project?.path);
  const stack = normalizeSearchText(project?.stack);
  const compactNeedle = compactSearchText(needle);
  const compactName = compactSearchText(name);

  if (name === needle || compactName === compactNeedle) return 120;
  if (name.startsWith(needle) || compactName.startsWith(compactNeedle)) return 100;
  if (name.includes(needle) || compactName.includes(compactNeedle)) return 80;
  if (path.includes(needle)) return 45;
  if (stack.includes(needle)) return 25;

  return tokenSearchScore(needle, [
    { value: name, weight: 10 },
    { value: path, weight: 4 },
    { value: stack, weight: 2 }
  ]);
}

export function folderNameSearchScore(name, query) {
  const needle = normalizeSearchText(query);
  const folderName = normalizeSearchText(name);
  if (!needle || !folderName) return 0;

  const compactNeedle = compactSearchText(needle);
  const compactName = compactSearchText(folderName);
  if (folderName === needle || compactName === compactNeedle) return 120;
  if (folderName.startsWith(needle) || compactName.startsWith(compactNeedle)) return 100;
  if (folderName.includes(needle) || compactName.includes(compactNeedle)) return 80;
  return tokenSearchScore(needle, [{ value: folderName, weight: 10 }]);
}

export function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compactSearchText(value) {
  return value.replace(/\s+/g, "");
}

function tokenSearchScore(query, fields) {
  const queryTokens = searchTokens(query);
  if (queryTokens.length === 0) return 0;

  let score = 0;
  let matched = 0;
  let strongMatches = 0;
  for (const queryToken of queryTokens) {
    const best = bestFieldTokenScore(queryToken, fields);
    if (best <= 0) continue;
    matched += 1;
    score += best;
    if (best >= 8) strongMatches += 1;
  }

  if (matched === queryTokens.length) return score + matched * 6;
  if (queryTokens.length === 1 && strongMatches === 1) return score;
  return 0;
}

function bestFieldTokenScore(queryToken, fields) {
  let best = 0;
  for (const field of fields) {
    for (const token of searchTokens(field.value)) {
      best = Math.max(best, singleTokenScore(queryToken, token, field.weight));
    }
  }
  return best;
}

function singleTokenScore(queryToken, candidateToken, weight) {
  if (candidateToken === queryToken) return weight + 10;
  if (candidateToken.startsWith(queryToken)) return weight + 7;
  if (candidateToken.includes(queryToken)) return weight + 4;
  if (isCloseToken(queryToken, candidateToken)) return weight;
  return 0;
}

function searchTokens(value) {
  return normalizeSearchText(value).split(/\s+/).filter(Boolean);
}

function isCloseToken(queryToken, candidateToken) {
  if (queryToken.length < 4 || candidateToken.length < 4) return false;
  const lengthGap = Math.abs(queryToken.length - candidateToken.length);
  const limit = queryToken.length <= 4 ? 1 : Math.max(2, Math.floor(queryToken.length * 0.34));
  if (lengthGap > limit) return false;
  return editDistance(queryToken, candidateToken, limit) <= limit;
}

function editDistance(a, b, maxDistance) {
  let twoRowsBack = null;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = current[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (twoRowsBack && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, twoRowsBack[j - 2] + 1);
      }
      current[j] = value;
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    twoRowsBack = previous;
    previous = current;
  }
  return previous[b.length];
}
