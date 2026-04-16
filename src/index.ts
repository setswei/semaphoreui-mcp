import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { randomUUID } from "node:crypto";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { api, isConfigured } from "./api-client.js";

const DOCS_DIR = process.env.DOCS_DIR || "/docs";
const PORT = parseInt(process.env.PORT || "3001");

// --- Doc indexing ---

interface DocEntry {
  path: string;
  title: string;
  content: string;
  contentLower: string;
  headings: string[];
}

function indexDocs(dir: string, base = ""): DocEntry[] {
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

let docs: DocEntry[] = [];
try {
  docs = indexDocs(DOCS_DIR);
  console.error(`Indexed ${docs.length} docs from ${DOCS_DIR}`);
} catch (e) {
  console.error(`Failed to index docs: ${e}`);
}

// --- Search helpers ---

function scoreDocs(query: string) {
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

function extractSnippet(content: string, query: string, len = 300): string {
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

// --- MCP Server factory ---

function createServer(): McpServer {
  const server = new McpServer({
    name: "semaphore-docs",
    version: "1.0.0",
  });

  server.tool(
    "semaphoreui_docs_search",
    "Search Semaphore UI documentation. Returns matching doc titles, paths, and a relevant snippet.",
    { query: z.string().describe("Search query (keywords)") },
    async ({ query }) => {
      const results = scoreDocs(query).slice(0, 10);
      if (!results.length) {
        return { content: [{ type: "text" as const, text: "No results found." }] };
      }
      const text = results
        .map(
          (r) =>
            `### ${r.doc.title}\nPath: \`${r.doc.path}\`\n${extractSnippet(r.doc.content, query)}`
        )
        .join("\n\n");
      return { content: [{ type: "text" as const, text }] };
    }
  );

  server.tool(
    "semaphoreui_docs_search_and_read",
    "Search Semaphore UI docs and return the full content of the top matching pages. Use this when you need detailed information on a topic.",
    {
      query: z.string().describe("Search query (keywords)"),
      max_results: z.number().min(1).max(5).default(3).describe("Number of full docs to return (1-5, default 3)"),
    },
    async ({ query, max_results }) => {
      const results = scoreDocs(query).slice(0, max_results);
      if (!results.length) {
        return { content: [{ type: "text" as const, text: "No results found." }] };
      }
      const text = results
        .map((r) => `# ${r.doc.title}\n_Source: \`${r.doc.path}\`_\n\n${r.doc.content}`)
        .join("\n\n---\n\n");
      return { content: [{ type: "text" as const, text }] };
    }
  );

  server.tool(
    "semaphoreui_docs_read",
    "Read a specific Semaphore UI documentation page by its path.",
    { path: z.string().describe("Doc path, e.g. admin-guide/installation.md") },
    async ({ path: docPath }) => {
      const doc = docs.find((d) => d.path === docPath);
      if (!doc) {
        return { content: [{ type: "text" as const, text: `Doc not found: ${docPath}` }] };
      }
      return { content: [{ type: "text" as const, text: doc.content }] };
    }
  );

  server.tool(
    "semaphoreui_docs_list",
    "List all available Semaphore UI documentation pages.",
    {},
    async () => {
      const text = docs.map((d) => `- **${d.title}** → \`${d.path}\``).join("\n");
      return { content: [{ type: "text" as const, text: text || "No docs indexed." }] };
    }
  );

  // --- API Tools (require SEMAPHORE_URL + SEMAPHORE_API_TOKEN) ---

  if (isConfigured()) {
    const pid = z.number().int().describe("Project ID");

    // Helper to wrap API calls with error handling
    async function call(method: string, path: string, body?: unknown) {
      try {
        const data = await api(method, path, body);
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true };
      }
    }

    // Projects
    server.tool("semaphoreui_api_list_projects", "List all Semaphore projects.", {}, () => call("GET", "/projects"));

    server.tool("semaphoreui_api_get_project", "Get a Semaphore project by ID.", { project_id: pid }, ({ project_id }) => call("GET", `/project/${project_id}`));

    // Templates
    server.tool(
      "semaphoreui_api_list_templates",
      "List task templates in a project.",
      { project_id: pid },
      ({ project_id }) => call("GET", `/project/${project_id}/templates?sort=name&order=asc`)
    );

    server.tool(
      "semaphoreui_api_get_template",
      "Get a specific task template.",
      { project_id: pid, template_id: z.number().int().describe("Template ID") },
      ({ project_id, template_id }) => call("GET", `/project/${project_id}/templates/${template_id}`)
    );

    // Tasks
    server.tool(
      "semaphoreui_api_run_task",
      "Start a task (run a template). Returns the created task.",
      {
        project_id: pid,
        template_id: z.number().int().describe("Template ID to run"),
        debug: z.boolean().default(false).describe("Enable debug output"),
        dry_run: z.boolean().default(false).describe("Dry run (check mode)"),
        diff: z.boolean().default(false).describe("Show diff"),
        playbook: z.string().optional().describe("Override playbook path"),
        environment: z.string().optional().describe("Override environment JSON"),
        limit: z.string().optional().describe("Limit to specific hosts"),
        git_branch: z.string().optional().describe("Override git branch"),
        message: z.string().optional().describe("Task message/description"),
      },
      ({ project_id, ...params }) => call("POST", `/project/${project_id}/tasks`, params)
    );

    server.tool(
      "semaphoreui_api_list_tasks",
      "Get the last 200 tasks for a project.",
      { project_id: pid },
      ({ project_id }) => call("GET", `/project/${project_id}/tasks/last`)
    );

    server.tool(
      "semaphoreui_api_get_task",
      "Get a specific task's status and details.",
      { project_id: pid, task_id: z.number().int().describe("Task ID") },
      ({ project_id, task_id }) => call("GET", `/project/${project_id}/tasks/${task_id}`)
    );

    server.tool(
      "semaphoreui_api_get_task_output",
      "Get the output/logs of a task.",
      { project_id: pid, task_id: z.number().int().describe("Task ID") },
      ({ project_id, task_id }) => call("GET", `/project/${project_id}/tasks/${task_id}/output`)
    );

    server.tool(
      "semaphoreui_api_stop_task",
      "Stop a running task.",
      {
        project_id: pid,
        task_id: z.number().int().describe("Task ID"),
        force: z.boolean().default(false).describe("Force kill immediately"),
      },
      ({ project_id, task_id, force }) => call("POST", `/project/${project_id}/tasks/${task_id}/stop`, { force })
    );

    // Inventory
    server.tool(
      "semaphoreui_api_list_inventory",
      "List inventories in a project.",
      { project_id: pid },
      ({ project_id }) => call("GET", `/project/${project_id}/inventory?sort=name&order=asc`)
    );

    // Keys
    server.tool(
      "semaphoreui_api_list_keys",
      "List access keys (credentials) in a project.",
      { project_id: pid },
      ({ project_id }) => call("GET", `/project/${project_id}/keys?sort=name&order=asc`)
    );

    // Repositories
    server.tool(
      "semaphoreui_api_list_repositories",
      "List repositories in a project.",
      { project_id: pid },
      ({ project_id }) => call("GET", `/project/${project_id}/repositories?sort=name&order=asc`)
    );

    // Environments (Variable Groups)
    server.tool(
      "semaphoreui_api_list_environments",
      "List variable groups (environments) in a project.",
      { project_id: pid },
      ({ project_id }) => call("GET", `/project/${project_id}/environment?sort=name&order=desc`)
    );

    // Schedules
    server.tool(
      "semaphoreui_api_list_schedules",
      "List schedules in a project.",
      { project_id: pid },
      ({ project_id }) => call("GET", `/project/${project_id}/schedules`)
    );

    console.error("API tools enabled (SEMAPHORE_API_TOKEN configured)");
  } else {
    console.error("API tools disabled (no SEMAPHORE_API_TOKEN)");
  }

  return server;
}

// --- Transport: stdio (default) or HTTP (--http flag) ---

async function main() {
  if (process.argv.includes("--http")) {
    const app = express();
    app.use(express.json());
    const sessions = new Map<string, StreamableHTTPServerTransport>();

    async function handleMcpRequest(req: express.Request, res: express.Response) {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport: StreamableHTTPServerTransport | undefined;
      if (sessionId && sessions.has(sessionId)) {
        transport = sessions.get(sessionId);
      } else if (!sessionId && req.method === "POST") {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            sessions.set(id, transport!);
            transport!.onclose = () => sessions.delete(id);
          },
        });
        await createServer().connect(transport);
      } else {
        res.status(400).json({ error: "Invalid or missing session" });
        return;
      }
      await transport!.handleRequest(req, res, req.body);
    }

    app.post("/mcp", handleMcpRequest);
    app.get("/mcp", handleMcpRequest);
    app.delete("/mcp", (req, res) => { sessions.delete(req.headers["mcp-session-id"] as string); res.status(200).end(); });
    app.get("/health", (_req, res) => res.json({ status: "ok", docs: docs.length }));
    app.listen(PORT, () => console.error(`MCP server (HTTP) on http://0.0.0.0:${PORT}/mcp`));
  } else {
    const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
    const transport = new StdioServerTransport();
    await createServer().connect(transport);
    console.error("MCP server running on stdio");
  }
}

main();
