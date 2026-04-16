# Semaphore UI MCP Server

An MCP server that indexes the [Semaphore UI documentation](https://semaphoreui.com/docs) and optionally connects to a live Semaphore instance via its API. Runs as a Docker container with stdio transport — just add it to your MCP config and go.

## Quick Start

### Pull the image

```bash
docker pull gitlab.cybercrysis.net.au:5050/mcp/semaphoreui:latest
```

Or build locally:

```bash
docker build -t gitlab.cybercrysis.net.au:5050/mcp/semaphoreui .
```

### Add to your MCP config

#### Kiro CLI (`~/.kiro/settings/mcp.json`)

Docs only:
```json
{
  "mcpServers": {
    "semaphore-docs": {
      "args": ["run", "-i", "--rm", "gitlab.cybercrysis.net.au:5050/mcp/semaphoreui:latest"],
      "command": "docker"
    }
  }
}
```

Docs + API:
```json
{
  "mcpServers": {
    "semaphore-docs": {
      "args": [
        "run", "-i", "--rm",
        "-e", "SEMAPHORE_URL",
        "-e", "SEMAPHORE_API_TOKEN",
        "gitlab.cybercrysis.net.au:5050/mcp/semaphoreui:latest"
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

#### Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`)

Same format as above.

> **Note:** Use `host.docker.internal` instead of `localhost` for `SEMAPHORE_URL` since the MCP runs inside Docker.

## Tools

### Documentation Tools (always available)

| Tool | Description |
|------|-------------|
| `semaphoreui_docs_search` | Keyword search, returns top 10 with snippets |
| `semaphoreui_docs_search_and_read` | Search + return full content of top N pages (1-5) |
| `semaphoreui_docs_read` | Read a specific doc page by path |
| `semaphoreui_docs_list` | List all documentation pages |

### API Tools (require `SEMAPHORE_API_TOKEN`)

| Tool | Description |
|------|-------------|
| `semaphoreui_api_list_projects` | List all projects |
| `semaphoreui_api_get_project` | Get project details by ID |
| `semaphoreui_api_list_templates` | List task templates in a project |
| `semaphoreui_api_get_template` | Get a specific task template |
| `semaphoreui_api_run_task` | Start a task (supports debug, dry_run, diff, limit, branch override) |
| `semaphoreui_api_list_tasks` | Get the last 200 tasks for a project |
| `semaphoreui_api_get_task` | Get task status and details |
| `semaphoreui_api_get_task_output` | Get task output/logs |
| `semaphoreui_api_stop_task` | Stop a running task (with optional force kill) |
| `semaphoreui_api_list_inventory` | List inventories in a project |
| `semaphoreui_api_list_keys` | List access keys (credentials) |
| `semaphoreui_api_list_repositories` | List repositories |
| `semaphoreui_api_list_environments` | List variable groups (environments) |
| `semaphoreui_api_list_schedules` | List schedules |

## Running as HTTP Server

For standalone/remote use, pass `--http`:

```bash
docker run -d -p 3001:3001 \
  -e SEMAPHORE_URL=http://semaphore:3000 \
  -e SEMAPHORE_API_TOKEN=your-token \
  gitlab.cybercrysis.net.au:5050/mcp/semaphoreui:latest node dist/index.js --http
```

Then use `"url": "http://localhost:3001/mcp"` in your MCP config.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SEMAPHORE_URL` | No | `http://localhost:3000` | URL of your Semaphore instance |
| `SEMAPHORE_API_TOKEN` | No | — | API token (enables API tools) |

## Development

```bash
npm install
npm run build
node dist/index.js          # stdio mode
node dist/index.js --http   # HTTP mode on port 3001
```

## Project Structure

```
├── .gitlab-ci.yml        # CI pipeline: build + push to GitLab Container Registry
├── Dockerfile            # Multi-stage build: compile TS → clone docs → run
├── docker-compose.yml    # Alternative: run as HTTP server locally
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts          # MCP server (stdio default, --http for HTTP)
    └── api-client.ts     # Semaphore API HTTP client
```
