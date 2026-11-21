import { clearToken, getToken } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// NestJS returns { message: string | string[], error, statusCode }.
async function readErrorMessage(response: Response): Promise<string | null> {
  const body = (await response.json().catch(() => null)) as {
    message?: unknown;
  } | null;

  if (typeof body?.message === "string") {
    return body.message;
  }

  if (
    Array.isArray(body?.message) &&
    body.message.every((item) => typeof item === "string")
  ) {
    return body.message.join(". ");
  }

  return null;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (!API_URL) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured");
  }

  const token = typeof window !== "undefined" ? getToken() : null;

  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const serverMessage = await readErrorMessage(response);

    if (response.status === 401 && token) {
      clearToken();

      if (window.location.pathname !== "/login") {
        // Full reload on purpose: there is no router outside components
        // and it discards any state from the expired session.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/login");
      }

      throw new ApiError(
        "Your session has expired. Please sign in again.",
        401,
      );
    }

    if (response.status === 404) {
      throw new ApiError(
        serverMessage ?? "The requested resource was not found.",
        404,
      );
    }

    throw new ApiError(
      serverMessage ?? `API error: ${response.status}`,
      response.status,
    );
  }

  return response.json() as Promise<T>;
}
