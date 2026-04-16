import fs from "fs";
import path from "path";

export interface DocEntry {
  path: string;
  title: string;
  content: string;
  contentLower: string;
  headings: string[];
}

export function indexDocs(dir: string, base = ""): DocEntry[] {
  const entries: DocEntry[] = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(base, item.name);
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      entries.push(...indexDocs(full, rel));
    } else if (item.name.endsWith(".md")) {
      const content = fs.readFileSync(full, "utf-8");
      const titleMatch = content.match(/^#\s+(.+)/m);
      const headings = [...content.matchAll(/^#{1,3}\s+(.+)/gm)].map((m) => m[1].toLowerCase());
      entries.push({
        path: rel,
        title: titleMatch?.[1] || item.name.replace(".md", ""),
        content,
        contentLower: content.toLowerCase(),
        headings,
      });
    }
  }
  return entries;
}

export function scoreDocs(docs: DocEntry[], query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return docs
    .map((doc) => {
      let score = 0;
      for (const t of terms) {
        if (doc.title.toLowerCase().includes(t)) score += 10;
        if (doc.headings.some((h) => h.includes(t))) score += 5;
        if (doc.path.toLowerCase().includes(t)) score += 3;
        if (doc.contentLower.includes(t)) score += 1;
      }
      return { doc, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function extractSnippet(content: string, query: string, len = 300): string {
  const lower = content.toLowerCase();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  let bestPos = 0;
  let bestCount = 0;
  for (let i = 0; i < lower.length - len; i += 50) {
    const window = lower.substring(i, i + len);
    const count = terms.filter((t) => window.includes(t)).length;
    if (count > bestCount) {
      bestCount = count;
      bestPos = i;
    }
  }
  return "..." + content.substring(bestPos, bestPos + len).trim() + "...";
}
