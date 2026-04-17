import { describe, it, expect, beforeAll } from "vitest";
import { mcpInit, mcpCallTool, mcpListTools } from "./mcp-client.js";

describe("E2E: MCP Server", () => {
  beforeAll(async () => { await mcpInit(); }, 10000);

  describe("Tool Registration", () => {
    it("registers all expected tools", async () => {
      const tools = await mcpListTools();
      expect(tools).toContain("semaphoreui_docs_search");
      expect(tools).toContain("semaphoreui_docs_list");
      expect(tools).toContain("semaphoreui_api_list_projects");
      expect(tools).toContain("semaphoreui_api_create_project");
      expect(tools).toContain("semaphoreui_api_filter_tasks");
      expect(tools.length).toBeGreaterThanOrEqual(44);
    });
  });

  describe("Docs Tools", () => {
    it("list_docs returns indexed pages", async () => {
      const result = await mcpCallTool("semaphoreui_docs_list");
      expect(result).toContain("installation");
    });

    it("search_docs finds relevant results", async () => {
      const result = await mcpCallTool("semaphoreui_docs_search", { query: "ansible inventory" });
      expect(result.toLowerCase()).toContain("inventory");
    });

    it("read_doc returns page content", async () => {
      const result = await mcpCallTool("semaphoreui_docs_read", { path: "user-guide/inventory.md" });
      expect(result).toContain("Inventory");
    });
  });

  describe("API CRUD Lifecycle", () => {
    let projectId: number;
    let keyId: number;
    let repoId: number;
    let envId: number;
    let inventoryId: number;

    it("creates a project", async () => {
      const result = await mcpCallTool("semaphoreui_api_create_project", { name: "E2E-Test-Project", alert: false, max_parallel_tasks: 0 });
      expect(result).toHaveProperty("id");
      expect(result.name).toBe("E2E-Test-Project");
      projectId = result.id;
    });

    it("lists projects including the new one", async () => {
      const result = await mcpCallTool("semaphoreui_api_list_projects");
      expect(result.some((p: any) => p.id === projectId)).toBe(true);
    });

    it("gets the project by ID", async () => {
      const result = await mcpCallTool("semaphoreui_api_get_project", { project_id: projectId });
      expect(result.name).toBe("E2E-Test-Project");
    });

    it("creates an access key", async () => {
      const result = await mcpCallTool("semaphoreui_api_create_key", { project_id: projectId, name: "e2e-key", type: "none" });
      expect(result).toHaveProperty("id");
      keyId = result.id;
    });

    it("creates a repository", async () => {
      const result = await mcpCallTool("semaphoreui_api_create_repository", {
        project_id: projectId, name: "e2e-repo",
        git_url: "https://github.com/semaphoreui/semaphore-demo.git",
        git_branch: "main", ssh_key_id: keyId,
      });
      expect(result).toHaveProperty("id");
      repoId = result.id;
    });

    it("creates an environment", async () => {
      const result = await mcpCallTool("semaphoreui_api_create_environment", {
        project_id: projectId, name: "e2e-env", json: "{}", env: "{}",
      });
      expect(result).toHaveProperty("id");
      envId = result.id;
    });

    it("creates an inventory", async () => {
      const result = await mcpCallTool("semaphoreui_api_create_inventory", {
        project_id: projectId, name: "e2e-hosts", type: "static",
        inventory: "localhost", ssh_key_id: keyId,
      });
      expect(result).toHaveProperty("id");
      inventoryId = result.id;
    });

    it("lists all resources in the project", async () => {
      const [keys, repos, envs, inv] = await Promise.all([
        mcpCallTool("semaphoreui_api_list_keys", { project_id: projectId }),
        mcpCallTool("semaphoreui_api_list_repositories", { project_id: projectId }),
        mcpCallTool("semaphoreui_api_list_environments", { project_id: projectId }),
        mcpCallTool("semaphoreui_api_list_inventory", { project_id: projectId }),
      ]);
      expect(keys.some((k: any) => k.id === keyId)).toBe(true);
      expect(repos.some((r: any) => r.id === repoId)).toBe(true);
      expect(envs.some((e: any) => e.id === envId)).toBe(true);
      expect(inv.some((i: any) => i.id === inventoryId)).toBe(true);
    });

    it("deletes inventory", async () => {
      const result = await mcpCallTool("semaphoreui_api_delete_inventory", { project_id: projectId, inventory_id: inventoryId });
      expect(result).toBeDefined();
    });

    it("deletes environment", async () => {
      const result = await mcpCallTool("semaphoreui_api_delete_environment", { project_id: projectId, environment_id: envId });
      expect(result).toBeDefined();
    });

    it("deletes repository", async () => {
      const result = await mcpCallTool("semaphoreui_api_delete_repository", { project_id: projectId, repository_id: repoId });
      expect(result).toBeDefined();
    });

    it("deletes key", async () => {
      const result = await mcpCallTool("semaphoreui_api_delete_key", { project_id: projectId, key_id: keyId });
      expect(result).toBeDefined();
    });

    it("deletes the project", async () => {
      const result = await mcpCallTool("semaphoreui_api_delete_project", { project_id: projectId });
      expect(result).toBeDefined();
    });
  });
});
