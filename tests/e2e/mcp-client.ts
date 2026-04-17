const MCP_URL = process.env.MCP_URL || "http://localhost:3001";

let sessionId: string | null = null;
let idCounter = 0;

export async function mcpInit(): Promise<void> {
  const res = await fetch(`${MCP_URL}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: ++idCounter, method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e-test", version: "1.0.0" } },
    }),
  });
  sessionId = res.headers.get("mcp-session-id");
  // Send initialized notification
  await fetch(`${MCP_URL}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "mcp-session-id": sessionId! },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
}

export async function mcpCallTool(name: string, args: Record<string, unknown> = {}): Promise<any> {
  const res = await fetch(`${MCP_URL}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "mcp-session-id": sessionId! },
    body: JSON.stringify({
      jsonrpc: "2.0", id: ++idCounter, method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const text = await res.text();
  // Parse SSE response
  const dataLine = text.split("\n").find(l => l.startsWith("data: "));
  if (!dataLine) throw new Error(`No data in response: ${text}`);
  const parsed = JSON.parse(dataLine.slice(6));
  if (parsed.error) throw new Error(parsed.error.message);
  const content = parsed.result?.content?.[0]?.text;
  if (!content) return null;
  try { return JSON.parse(content); } catch { return content; }
}

export async function mcpListTools(): Promise<string[]> {
  const res = await fetch(`${MCP_URL}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "mcp-session-id": sessionId! },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++idCounter, method: "tools/list" }),
  });
  const text = await res.text();
  const dataLine = text.split("\n").find(l => l.startsWith("data: "));
  const parsed = JSON.parse(dataLine!.slice(6));
  return parsed.result.tools.map((t: any) => t.name);
}
