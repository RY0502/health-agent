export const normalizeWhitespace = (value) => value.replace(/\s+/g, " ").trim();
export const tokenize = (value) => normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
export const unique = (items) => [...new Set(items)];
export const sentenceWindow = (text, needle, radius = 220) => {
    const haystack = text.toLowerCase();
    const index = haystack.indexOf(needle.toLowerCase());
    if (index < 0)
        return normalizeWhitespace(text.slice(0, radius * 2));
    const start = Math.max(0, index - radius);
    const end = Math.min(text.length, index + needle.length + radius);
    return normalizeWhitespace(text.slice(start, end));
};
export const overlapScore = (a, b) => {
    const left = new Set(Array.isArray(a) ? a.flatMap(tokenize) : tokenize(a));
    const right = new Set(Array.isArray(b) ? b.flatMap(tokenize) : tokenize(b));
    if (!left.size || !right.size)
        return 0;
    let matches = 0;
    for (const token of left) {
        if (right.has(token))
            matches += 1;
    }
    return matches / Math.max(left.size, right.size);
};
export const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export const toTitleCase = (value) => value.replace(/\w\S*/g, (txt) => txt[0].toUpperCase() + txt.slice(1).toLowerCase());
export const shortText = (value, max = 280) => {
    if (value.length <= max)
        return value;
    return `${value.slice(0, max - 1).trimEnd()}…`;
};
