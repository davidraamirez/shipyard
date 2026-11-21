const ACCESS_TOKEN_KEY = "shipyard_access_token";

// sessionStorage can throw in private mode or with storage
// blocked: in that case it behaves as if there were no session.
export function getToken(): string | null {
  try {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string) {
  try {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
  } catch {
    // Without storage the session is simply not persisted.
  }
}

export function clearToken() {
  try {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    // Nothing to clear.
  }
}
