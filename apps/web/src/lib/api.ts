const API_URL = process.env.NEXT_PUBLIC_API_URL;

export const ACCESS_TOKEN_KEY = "shipyard_access_token";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// NestJS devuelve { message: string | string[], error, statusCode }.
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
    throw new Error("Falta configurar NEXT_PUBLIC_API_URL");
  }

  const token =
    typeof window !== "undefined"
      ? sessionStorage.getItem(ACCESS_TOKEN_KEY)
      : null;

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
      sessionStorage.removeItem(ACCESS_TOKEN_KEY);

      if (window.location.pathname !== "/login") {
        // Recarga completa a propósito: no hay router fuera de los componentes
        // y así se descarta cualquier estado de la sesión caducada.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/login");
      }

      throw new ApiError(
        "Tu sesión ha caducado. Inicia sesión de nuevo.",
        401,
      );
    }

    if (response.status === 404) {
      throw new ApiError(
        serverMessage ?? "No se encontró el recurso solicitado.",
        404,
      );
    }

    throw new ApiError(
      serverMessage ?? `Error de API: ${response.status}`,
      response.status,
    );
  }

  return response.json() as Promise<T>;
}
