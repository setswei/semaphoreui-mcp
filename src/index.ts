import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { api, isConfigured } from "./api-client.js";
import { indexDocs, scoreDocs, extractSnippet, type DocEntry } from "./docs.js";
import { logger } from "./logger.js";

const DOCS_DIR = process.env.DOCS_DIR || "/docs";
const PORT = parseInt(process.env.PORT || "3001");

let docs: DocEntry[] = [];
try {
  docs = indexDocs(DOCS_DIR);
  logger.info(`Indexed ${docs.length} docs from ${DOCS_DIR}`);
} catch (e) {
  logger.error(`Failed to index docs: ${e}`);
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
      const results = scoreDocs(docs, query).slice(0, 10);
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
      const results = scoreDocs(docs, query).slice(0, max_results);
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

    server.tool("semaphoreui_api_create_project", "Create a new Semaphore project.", {
      name: z.string().describe("Project name"),
      alert: z.boolean().default(false).describe("Enable alerts"),
      max_parallel_tasks: z.number().int().default(0).describe("Max parallel tasks (0=unlimited)"),
    }, ({ ...body }) => call("POST", "/projects", body));

    server.tool("semaphoreui_api_update_project", "Update a Semaphore project.", {
      project_id: pid,
      name: z.string().describe("Project name"),
      alert: z.boolean().default(false).describe("Enable alerts"),
      max_parallel_tasks: z.number().int().default(0).describe("Max parallel tasks (0=unlimited)"),
    }, ({ project_id, ...body }) => call("PUT", `/project/${project_id}`, body));

    server.tool("semaphoreui_api_delete_project", "Delete a Semaphore project.", { project_id: pid }, ({ project_id }) => call("DELETE", `/project/${project_id}`));

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

    server.tool("semaphoreui_api_create_template", "Create a task template.", {
      project_id: pid,
      name: z.string().describe("Template name"),
      playbook: z.string().describe("Playbook/script path"),
      inventory_id: z.number().int().describe("Inventory ID"),
      repository_id: z.number().int().describe("Repository ID"),
      environment_id: z.number().int().describe("Environment ID"),
      app: z.string().default("ansible").describe("App type: ansible, terraform, bash, powershell, python"),
      arguments: z.string().default("[]").describe("Extra CLI arguments as JSON array"),
      description: z.string().optional().describe("Template description"),
      allow_override_args_in_task: z.boolean().default(false).describe("Allow arg override when running"),
    }, ({ project_id, ...body }) => call("POST", `/project/${project_id}/templates`, { project_id, ...body }));

    server.tool("semaphoreui_api_update_template", "Update a task template.", {
      project_id: pid,
      template_id: z.number().int().describe("Template ID"),
      name: z.string().describe("Template name"),
      playbook: z.string().describe("Playbook/script path"),
      inventory_id: z.number().int().describe("Inventory ID"),
      repository_id: z.number().int().describe("Repository ID"),
      environment_id: z.number().int().describe("Environment ID"),
      app: z.string().default("ansible").describe("App type"),
      arguments: z.string().default("[]").describe("Extra CLI arguments as JSON array"),
      description: z.string().optional().describe("Template description"),
    }, ({ project_id, template_id, ...body }) => call("PUT", `/project/${project_id}/templates/${template_id}`, { id: template_id, project_id, ...body }));

    server.tool("semaphoreui_api_delete_template", "Delete a task template.", {
      project_id: pid, template_id: z.number().int().describe("Template ID"),
    }, ({ project_id, template_id }) => call("DELETE", `/project/${project_id}/templates/${template_id}`));

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
      ({ project_id, task_id, force }) => {
        return call("POST", `/project/${project_id}/tasks/${task_id}/stop`, { force })
          .then(() => call("GET", `/project/${project_id}/tasks/${task_id}`));
      }
    );

    // Inventory
    server.tool(
      "semaphoreui_api_list_inventory",
      "List inventories in a project.",
      { project_id: pid },
      ({ project_id }) => call("GET", `/project/${project_id}/inventory?sort=name&order=asc`)
    );

    server.tool("semaphoreui_api_create_inventory", "Create an inventory.", {
      project_id: pid,
      name: z.string().describe("Inventory name"),
      type: z.enum(["static", "static-yaml", "file"]).describe("Inventory type"),
      inventory: z.string().describe("Inventory content (static) or file path (file type)"),
      ssh_key_id: z.number().int().describe("SSH key ID for host access"),
      become_key_id: z.number().int().optional().describe("Sudo/become key ID"),
    }, ({ project_id, ...body }) => call("POST", `/project/${project_id}/inventory`, { project_id, ...body }));

    server.tool("semaphoreui_api_update_inventory", "Update an inventory.", {
      project_id: pid,
      inventory_id: z.number().int().describe("Inventory ID"),
      name: z.string().describe("Inventory name"),
      type: z.enum(["static", "static-yaml", "file"]).describe("Inventory type"),
      inventory: z.string().describe("Inventory content or file path"),
      ssh_key_id: z.number().int().describe("SSH key ID"),
      become_key_id: z.number().int().optional().describe("Sudo/become key ID"),
    }, ({ project_id, inventory_id, ...body }) => call("PUT", `/project/${project_id}/inventory/${inventory_id}`, { id: inventory_id, project_id, ...body }));

    server.tool("semaphoreui_api_delete_inventory", "Delete an inventory.", {
      project_id: pid, inventory_id: z.number().int().describe("Inventory ID"),
    }, ({ project_id, inventory_id }) => call("DELETE", `/project/${project_id}/inventory/${inventory_id}`));

    // Keys
    server.tool(
      "semaphoreui_api_list_keys",
      "List access keys (credentials) in a project.",
      { project_id: pid },
      ({ project_id }) => call("GET", `/project/${project_id}/keys?sort=name&order=asc`)
    );

    server.tool("semaphoreui_api_create_key", "Create an access key.", {
      project_id: pid,
      name: z.string().describe("Key name"),
      type: z.enum(["none", "ssh", "login_password"]).describe("Key type"),
      login_password: z.object({
        login: z.string(), password: z.string(),
      }).optional().describe("Login/password credentials (for login_password type)"),
      ssh: z.object({
        login: z.string(), private_key: z.string(), passphrase: z.string().default(""),
      }).optional().describe("SSH credentials (for ssh type)"),
    }, ({ project_id, ...body }) => call("POST", `/project/${project_id}/keys`, { project_id, ...body }));

    server.tool("semaphoreui_api_update_key", "Update an access key.", {
      project_id: pid,
      key_id: z.number().int().describe("Key ID"),
      name: z.string().describe("Key name"),
      type: z.enum(["none", "ssh", "login_password"]).describe("Key type"),
      login_password: z.object({
        login: z.string(), password: z.string(),
      }).optional().describe("Login/password credentials"),
      ssh: z.object({
        login: z.string(), private_key: z.string(), passphrase: z.string().default(""),
      }).optional().describe("SSH credentials"),
    }, ({ project_id, key_id, ...body }) => call("PUT", `/project/${project_id}/keys/${key_id}`, { id: key_id, project_id, ...body }));

    server.tool("semaphoreui_api_delete_key", "Delete an access key.", {
      project_id: pid, key_id: z.number().int().describe("Key ID"),
    }, ({ project_id, key_id }) => call("DELETE", `/project/${project_id}/keys/${key_id}`));

    // Repositories
    server.tool(
      "semaphoreui_api_list_repositories",
      "List repositories in a project.",
      { project_id: pid },
      ({ project_id }) => call("GET", `/project/${project_id}/repositories?sort=name&order=asc`)
    );

    server.tool("semaphoreui_api_create_repository", "Create a repository.", {
      project_id: pid,
      name: z.string().describe("Repository name"),
      git_url: z.string().describe("Git URL"),
      git_branch: z.string().default("main").describe("Git branch"),
      ssh_key_id: z.number().int().describe("SSH key ID for git auth"),
    }, ({ project_id, ...body }) => call("POST", `/project/${project_id}/repositories`, { project_id, ...body }));

    server.tool("semaphoreui_api_update_repository", "Update a repository.", {
      project_id: pid,
      repository_id: z.number().int().describe("Repository ID"),
      name: z.string().describe("Repository name"),
      git_url: z.string().describe("Git URL"),
      git_branch: z.string().default("main").describe("Git branch"),
      ssh_key_id: z.number().int().describe("SSH key ID"),
    }, ({ project_id, repository_id, ...body }) => call("PUT", `/project/${project_id}/repositories/${repository_id}`, { id: repository_id, project_id, ...body }));

    server.tool("semaphoreui_api_delete_repository", "Delete a repository.", {
      project_id: pid, repository_id: z.number().int().describe("Repository ID"),
    }, ({ project_id, repository_id }) => call("DELETE", `/project/${project_id}/repositories/${repository_id}`));

    // Environments (Variable Groups)
    server.tool(
      "semaphoreui_api_list_environments",
      "List variable groups (environments) in a project.",
      { project_id: pid },
      ({ project_id }) => call("GET", `/project/${project_id}/environment?sort=name&order=desc`)
    );

    server.tool("semaphoreui_api_create_environment", "Create a variable group (environment).", {
      project_id: pid,
      name: z.string().describe("Environment name"),
      json: z.string().default("{}").describe("Variables as JSON string"),
      env: z.string().default("{}").describe("Environment variables as JSON string"),
    }, ({ project_id, ...body }) => call("POST", `/project/${project_id}/environment`, { project_id, ...body }));

    server.tool("semaphoreui_api_update_environment", "Update a variable group (environment).", {
      project_id: pid,
      environment_id: z.number().int().describe("Environment ID"),
      name: z.string().describe("Environment name"),
      json: z.string().default("{}").describe("Variables as JSON string"),
      env: z.string().default("{}").describe("Environment variables as JSON string"),
    }, ({ project_id, environment_id, ...body }) => call("PUT", `/project/${project_id}/environment/${environment_id}`, { id: environment_id, project_id, ...body }));

    server.tool("semaphoreui_api_delete_environment", "Delete a variable group (environment).", {
      project_id: pid, environment_id: z.number().int().describe("Environment ID"),
    }, ({ project_id, environment_id }) => call("DELETE", `/project/${project_id}/environment/${environment_id}`));

    // Schedules
    server.tool(
      "semaphoreui_api_list_schedules",
      "List schedules in a project.",
      { project_id: pid },
      ({ project_id }) => call("GET", `/project/${project_id}/schedules`)
    );

    server.tool("semaphoreui_api_create_schedule", "Create a schedule.", {
      project_id: pid,
      template_id: z.number().int().describe("Template ID to schedule"),
      name: z.string().describe("Schedule name"),
      cron_format: z.string().describe("Cron expression (e.g. '0 14 * * *')"),
      active: z.boolean().default(true).describe("Enable schedule"),
    }, ({ project_id, ...body }) => call("POST", `/project/${project_id}/schedules`, { project_id, ...body }));

    server.tool("semaphoreui_api_update_schedule", "Update a schedule.", {
      project_id: pid,
      schedule_id: z.number().int().describe("Schedule ID"),
      template_id: z.number().int().describe("Template ID"),
      name: z.string().describe("Schedule name"),
      cron_format: z.string().describe("Cron expression"),
      active: z.boolean().default(true).describe("Enable schedule"),
    }, ({ project_id, schedule_id, ...body }) => call("PUT", `/project/${project_id}/schedules/${schedule_id}`, { id: schedule_id, project_id, ...body }));

    server.tool("semaphoreui_api_delete_schedule", "Delete a schedule.", {
      project_id: pid, schedule_id: z.number().int().describe("Schedule ID"),
    }, ({ project_id, schedule_id }) => call("DELETE", `/project/${project_id}/schedules/${schedule_id}`));

    logger.info("API tools enabled (SEMAPHORE_API_TOKEN configured)");
  } else {
    logger.info("API tools disabled (no SEMAPHORE_API_TOKEN)");
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
    app.listen(PORT, () => logger.info(`MCP server (HTTP) on http://0.0.0.0:${PORT}/mcp`));
  } else {
    const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
    const transport = new StdioServerTransport();
    await createServer().connect(transport);
    logger.info("MCP server running on stdio");
  }
}

main();
