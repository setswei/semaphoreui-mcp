export interface ApiConfig {
  url: string;
  token: string;
}

export function getConfig(): ApiConfig {
  return {
    url: (process.env.SEMAPHORE_URL || "http://localhost:3000").replace(/\/+$/, ""),
    token: process.env.SEMAPHORE_API_TOKEN || "",
  };
}

export async function api(method: string, path: string, body?: unknown, config?: ApiConfig): Promise<unknown> {
  const { url: baseUrl, token } = config || getConfig();
  const url = `${baseUrl}/api${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e: any) {
    throw new Error(`Failed to connect to ${baseUrl}: ${e.message}`);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

export function isConfigured(config?: ApiConfig): boolean {
  return !!(config || getConfig()).token;
}
