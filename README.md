# Semaphore UI MCP Server

A Model Context Protocol (MCP) server that gives AI assistants full access to [Semaphore UI](https://semaphoreui.com/) — both its documentation and its API. Search docs, manage projects, run tasks, and troubleshoot failures through natural language.

## What it does

- **44 tools** — 4 documentation tools + 40 API tools
- **Documentation search** — indexes the full [Semaphore UI docs](https://semaphoreui.com/docs) from GitHub at build time with weighted keyword search and snippet extraction
- **Full CRUD** — create, read, update, and delete projects, templates, inventories, environments, repositories, access keys, and schedules
- **Task management** — run tasks, stop tasks, get output/logs, filter by status, analyze failures
- **Dual transport** — stdio (default, for Kiro CLI / Claude Desktop) or HTTP (`--http` flag for remote/standalone use)

## Quick Start

### 1. Pull the image

```bash
docker pull setswei/semaphoreui-mcp:latest
```

Or build locally:

```bash
docker build -t mcp/semaphoreui-docs .
```

### 2. Add to your MCP config

#### Kiro CLI (`~/.kiro/settings/mcp.json`)

Docs only (no Semaphore instance needed):

```json
{
  "mcpServers": {
    "semaphore-docs": {
      "args": ["run", "-i", "--rm", "setswei/semaphoreui-mcp:latest"],
      "command": "docker"
    }
  }
}
```

Docs + API (full access to your Semaphore instance):

```json
{
  "mcpServers": {
    "semaphore-docs": {
      "args": [
        "run", "-i", "--rm",
        "-e", "SEMAPHORE_URL",
        "-e", "SEMAPHORE_API_TOKEN",
        "setswei/semaphoreui-mcp:latest"
      ],
      "command": "docker",
      "env": {
        "SEMAPHORE_URL": "http://host.docker.internal:3000",
        "SEMAPHORE_API_TOKEN": "your-api-token-here"
      }
    }
  }
}
```

#### Claude Desktop

Same format as above in `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS).

### 3. Restart your AI client

The container starts automatically when the MCP client connects.

> Use `host.docker.internal` instead of `localhost` for `SEMAPHORE_URL` since the MCP runs inside Docker.

## Tools

### Documentation Tools (always available)

| Tool | Description |
|------|-------------|
| `semaphoreui_docs_search` | Keyword search across all docs, returns top 10 with relevant snippets |
| `semaphoreui_docs_search_and_read` | Search and return full content of top N pages (1-5) in one call |
| `semaphoreui_docs_read` | Read a specific doc page by path |
| `semaphoreui_docs_list` | List all 93 documentation pages |

### API Tools — Projects

| Tool | Description |
|------|-------------|
| `semaphoreui_api_list_projects` | List all projects |
| `semaphoreui_api_get_project` | Get project details |
| `semaphoreui_api_create_project` | Create a new project |
| `semaphoreui_api_update_project` | Update a project |
| `semaphoreui_api_delete_project` | Delete a project |

### API Tools — Templates

| Tool | Description |
|------|-------------|
| `semaphoreui_api_list_templates` | List task templates in a project |
| `semaphoreui_api_get_template` | Get a specific template |
| `semaphoreui_api_create_template` | Create a task template |
| `semaphoreui_api_update_template` | Update a template |
| `semaphoreui_api_delete_template` | Delete a template |

### API Tools — Tasks

| Tool | Description |
|------|-------------|
| `semaphoreui_api_run_task` | Start a task (supports debug, dry_run, diff, limit, branch override) |
| `semaphoreui_api_list_tasks` | Get the last 200 tasks |
| `semaphoreui_api_get_task` | Get task status and details |
| `semaphoreui_api_get_task_output` | Get structured task output |
| `semaphoreui_api_get_task_raw_output` | Get raw text output/logs |
| `semaphoreui_api_stop_task` | Stop a task (returns updated status) |
| `semaphoreui_api_filter_tasks` | Filter tasks by status and/or template |
| `semaphoreui_api_get_latest_failed_task` | Get the most recent failed task |
| `semaphoreui_api_analyze_task_failure` | Get failed task details + output in one call |
| `semaphoreui_api_bulk_stop_tasks` | Stop all active tasks for a template |

### API Tools — Inventory

| Tool | Description |
|------|-------------|
| `semaphoreui_api_list_inventory` | List inventories |
| `semaphoreui_api_create_inventory` | Create an inventory (static, static-yaml, or file) |
| `semaphoreui_api_update_inventory` | Update an inventory |
| `semaphoreui_api_delete_inventory` | Delete an inventory |

### API Tools — Access Keys

| Tool | Description |
|------|-------------|
| `semaphoreui_api_list_keys` | List access keys |
| `semaphoreui_api_create_key` | Create a key (none, ssh, or login_password) |
| `semaphoreui_api_update_key` | Update a key |
| `semaphoreui_api_delete_key` | Delete a key |

### API Tools — Repositories

| Tool | Description |
|------|-------------|
| `semaphoreui_api_list_repositories` | List repositories |
| `semaphoreui_api_create_repository` | Create a repository |
| `semaphoreui_api_update_repository` | Update a repository |
| `semaphoreui_api_delete_repository` | Delete a repository |

### API Tools — Environments (Variable Groups)

| Tool | Description |
|------|-------------|
| `semaphoreui_api_list_environments` | List variable groups |
| `semaphoreui_api_create_environment` | Create a variable group |
| `semaphoreui_api_update_environment` | Update a variable group |
| `semaphoreui_api_delete_environment` | Delete a variable group |

### API Tools — Schedules

| Tool | Description |
|------|-------------|
| `semaphoreui_api_list_schedules` | List schedules |
| `semaphoreui_api_create_schedule` | Create a schedule (cron) |
| `semaphoreui_api_update_schedule` | Update a schedule |
| `semaphoreui_api_delete_schedule` | Delete a schedule |

## Running as HTTP Server

For standalone or remote use:

```bash
docker run -d -p 3001:3001 \
  -e SEMAPHORE_URL=http://semaphore:3000 \
  -e SEMAPHORE_API_TOKEN=your-token \
  setswei/semaphoreui-mcp:latest \
  node dist/index.js --http
```

Then use `"url": "http://localhost:3001/mcp"` in your MCP config.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SEMAPHORE_URL` | No | `http://localhost:3000` | URL of your Semaphore instance |
| `SEMAPHORE_API_TOKEN` | No | — | API token (enables 40 API tools) |
| `MCP_LOG_LEVEL` | No | `info` | Log level: `debug`, `info`, `warn`, `error` |

## Example Prompts

```
Search the semaphore docs for how to configure LDAP authentication.
```

```
List all my Semaphore projects and show the templates in the first one.
```

```
Run the "Deploy Production" template in project 1 with dry_run enabled.
```

```
Show me all failed tasks in the last week and analyze the most recent failure.
```

```
Create a new project called "staging", add a repository pointing to my git repo,
create a static inventory with my hosts, and set up a template to run my playbook.
```

## Development

```bash
npm install
npm run build
npm test                    # 57 unit tests
node dist/index.js          # stdio mode
node dist/index.js --http   # HTTP mode on port 3001
./scripts/run-e2e.sh        # 17 E2E tests (requires Docker)
```

## CI/CD

The GitLab CI pipeline runs on every push to `main`:

1. **test** — build + 57 unit tests
2. **auto-release** — bumps version from conventional commits (`feat:` → minor, `fix:` → patch)
3. **build** — pushes Docker image with semver tags (`1.2.3`, `1.2`, `1`, `latest`)

See [CONTRIBUTING.md](CONTRIBUTING.md) for commit conventions and release process.

## Project Structure

```
├── .gitlab-ci.yml          # CI: test → auto-release → build
├── Dockerfile              # Multi-stage: compile TS → clone docs → run
├── docker-compose.yml      # Run as HTTP server locally
├── docker-compose.test.yml # E2E test environment
├── scripts/run-e2e.sh      # E2E test runner
├── CONTRIBUTING.md         # Commit conventions and release process
├── LICENSE                 # MIT
└── src/
    ├── index.ts            # MCP server (44 tools, stdio/HTTP transport)
    ├── api-client.ts       # Semaphore API HTTP client
    ├── docs.ts             # Documentation indexing and search
    └── logger.ts           # Configurable logging
```

## License

MIT — see [LICENSE](LICENSE).
