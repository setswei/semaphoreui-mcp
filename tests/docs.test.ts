import { describe, it, expect } from "vitest";
import fs from "fs";
import { indexDocs, scoreDocs, extractSnippet, type DocEntry } from "../src/docs.js";

const testDocs: DocEntry[] = [
  {
    path: "admin-guide/installation.md",
    title: "Installation",
    content: "# Installation\n## Docker\nRun semaphore in Docker.\n## Binary\nDownload the binary.",
    contentLower: "# installation\n## docker\nrun semaphore in docker.\n## binary\ndownload the binary.",
    headings: ["installation", "docker", "binary"],
  },
  {
    path: "user-guide/inventory.md",
    title: "Inventory",
    content: "# Inventory\n## Static Inventory\nPaste your inventory.\n## File Inventory\nPoint to a file.",
    contentLower: "# inventory\n## static inventory\npaste your inventory.\n## file inventory\npoint to a file.",
    headings: ["inventory", "static inventory", "file inventory"],
  },
  {
    path: "user-guide/tasks.md",
    title: "Tasks",
    content: "# Tasks\nRun ansible playbooks as tasks. Monitor task output.",
    contentLower: "# tasks\nrun ansible playbooks as tasks. monitor task output.",
    headings: ["tasks"],
  },
];

describe("scoreDocs()", () => {
  it("scores title matches highest", () => {
    const results = scoreDocs(testDocs, "inventory");
    expect(results[0].doc.title).toBe("Inventory");
    expect(results[0].score).toBeGreaterThan(results[1]?.score || 0);
  });

  it("returns empty array for no matches", () => {
    expect(scoreDocs(testDocs, "kubernetes")).toEqual([]);
  });

  it("scores heading matches", () => {
    const results = scoreDocs(testDocs, "docker");
    expect(results[0].doc.title).toBe("Installation");
  });

  it("scores path matches", () => {
    const results = scoreDocs(testDocs, "admin-guide");
    expect(results[0].doc.path).toContain("admin-guide");
  });

  it("handles multi-word queries", () => {
    const results = scoreDocs(testDocs, "ansible tasks");
    expect(results[0].doc.title).toBe("Tasks");
  });

  it("sorts by score descending", () => {
    const results = scoreDocs(testDocs, "inventory file");
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });
});

describe("extractSnippet()", () => {
  const longContent = "A".repeat(200) + "The ansible inventory is configured here." + "B".repeat(200);

  it("returns a snippet containing the query terms", () => {
    const snippet = extractSnippet(longContent, "ansible inventory", 100);
    expect(snippet).toContain("...");
    expect(snippet.toLowerCase()).toContain("ansible");
  });

  it("returns snippet with ellipsis wrapper", () => {
    const snippet = extractSnippet("Short content", "short", 300);
    expect(snippet.startsWith("...")).toBe(true);
    expect(snippet.endsWith("...")).toBe(true);
  });
});

describe("indexDocs()", () => {
  it("reads markdown files from a directory", () => {
    const tmpDir = fs.mkdtempSync("/tmp/docs-test-");
    fs.writeFileSync(`${tmpDir}/test.md`, "# Test Doc\n## Section\nSome content.");
    fs.writeFileSync(`${tmpDir}/ignore.txt`, "not markdown");

    const docs = indexDocs(tmpDir);
    expect(docs).toHaveLength(1);
    expect(docs[0].title).toBe("Test Doc");
    expect(docs[0].headings).toContain("test doc");
    expect(docs[0].headings).toContain("section");

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("recurses into subdirectories", () => {
    const tmpDir = fs.mkdtempSync("/tmp/docs-test-");
    fs.mkdirSync(`${tmpDir}/sub`);
    fs.writeFileSync(`${tmpDir}/sub/nested.md`, "# Nested\nContent.");

    const docs = indexDocs(tmpDir);
    expect(docs).toHaveLength(1);
    expect(docs[0].path).toBe("sub/nested.md");

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("uses filename as title when no heading found", () => {
    const tmpDir = fs.mkdtempSync("/tmp/docs-test-");
    fs.writeFileSync(`${tmpDir}/no-heading.md`, "Just some content without a heading.");

    const docs = indexDocs(tmpDir);
    expect(docs[0].title).toBe("no-heading");

    fs.rmSync(tmpDir, { recursive: true });
  });
});
