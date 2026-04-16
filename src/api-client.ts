const SEMAPHORE_URL = (process.env.SEMAPHORE_URL || "http://localhost:3000").replace(/\/+$/, "");
const SEMAPHORE_API_TOKEN = process.env.SEMAPHORE_API_TOKEN || "";

export async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const url = `${SEMAPHORE_URL}/api${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SEMAPHORE_API_TOKEN}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e: any) {
    throw new Error(`Failed to connect to ${SEMAPHORE_URL}: ${e.message}`);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

export function isConfigured(): boolean {
  return !!SEMAPHORE_API_TOKEN;
}
