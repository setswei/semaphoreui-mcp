/**
 * Documentation indexing and search engine.
 *
 * At startup, all markdown files from the semaphore-docs GitHub repo
 * (cloned into the Docker image at build time) are read into memory.
 * Search uses weighted keyword matching across titles, headings, paths,
 * and body content to rank results.
 */

import fs from "fs";
import path from "path";

/** A single indexed documentation page. */
export interface DocEntry {
  /** Relative path, e.g. "admin-guide/installation.md" */
  path: string;
  /** Page title extracted from the first # heading */
  title: string;
  /** Full markdown content */
  content: string;
  /** Lowercase content for case-insensitive search */
  contentLower: string;
  /** Lowercase h1-h3 headings for weighted search scoring */
  headings: string[];
}

/**
 * Recursively index all .md files in a directory.
 * Non-markdown files are ignored.
 */
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

/**
 * Score and rank docs against a search query.
 *
 * Scoring weights:
 *   - Title match:   10 points per term
 *   - Heading match:  5 points per term
 *   - Path match:     3 points per term
 *   - Body match:     1 point per term
 *
 * Returns results sorted by score descending, filtered to score > 0.
 */
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

/**
 * Extract the most relevant snippet from a doc for a given query.
 * Slides a window across the content and picks the position with
 * the most query term matches.
 */
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
