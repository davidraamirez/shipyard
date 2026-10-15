const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (!API_URL) {
    throw new Error("Falta configurar NEXT_PUBLIC_API_URL");
  }

  const token =
    typeof window !== "undefined"
      ? sessionStorage.getItem("shipyard_access_token")
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
    if (response.status === 401) {
      throw new Error("Tu sesión ha caducado. Inicia sesión de nuevo.");
    }

    if (response.status === 404) {
      throw new Error("No se encontró el recurso solicitado.");
    }

    throw new Error(`Error de API: ${response.status}`);
  }

  return response.json() as Promise<T>;
}