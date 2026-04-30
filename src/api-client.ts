/**
 * Semaphore UI API client.
 *
 * Provides a thin HTTP wrapper around the Semaphore REST API.
 * Authentication is via Bearer token passed in the Authorization header.
 *
 * Configuration comes from environment variables:
 *   SEMAPHORE_URL       - Base URL of the Semaphore instance (default: http://localhost:3000)
 *   SEMAPHORE_API_TOKEN - API token for authentication (enables API tools when set)
 *
 * The config can also be injected directly for testing.
 */

import { logger } from "./logger.js";

export interface ApiConfig {
  url: string;
  token: string;
}

/** Read API config from environment variables. */
export function getConfig(): ApiConfig {
  return {
    url: (process.env.SEMAPHORE_URL || "http://localhost:3000").replace(/\/+$/, ""),
    token: process.env.SEMAPHORE_API_TOKEN || "",
  };
}

/**
 * Make an authenticated request to the Semaphore API.
 *
 * @param method - HTTP method (GET, POST, PUT, DELETE)
 * @param path   - API path, e.g. "/projects" or "/project/1/tasks"
 * @param body   - Optional request body (will be JSON-serialized)
 * @param config - Optional config override (for testing)
 * @returns Parsed JSON response, or raw text for non-JSON responses
 * @throws Error with status code and message on HTTP errors or connection failures
 */
export async function api(method: string, path: string, body?: unknown, config?: ApiConfig): Promise<unknown> {
  const { url: baseUrl, token } = config || getConfig();
  const url = `${baseUrl}/api${path}`;
  logger.debug(`${method} ${url}`);
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
    logger.error(`${method} ${path} → ${res.status}: ${text}`);
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  logger.debug(`${method} ${path} → ${res.status}`);
  const text = await res.text();
  if (!text) return null;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return JSON.parse(text);
  return text;
}

/** Check if the API token is configured (determines whether API tools are registered). */
export function isConfigured(config?: ApiConfig): boolean {
  return !!(config || getConfig()).token;
}
