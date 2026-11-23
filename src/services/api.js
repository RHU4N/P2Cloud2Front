const API_URL = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");

async function request(path, { method = "GET", token = "" } = {}) {
  if (!API_URL) {
    throw new Error("URL da API (VITE_API_URL) não configurada.");
  }

  const headers = {
    Accept: "application/json",
  };

  if (method === "POST") {
    headers["Content-Type"] = "application/json";
  }

  const cleanToken = token.trim();
  if (cleanToken) {
    headers.Authorization = `Bearer ${cleanToken}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error((data && data.error) || `Erro HTTP ${response.status}`);
  }

  return data;
}

export function listDriveFiles(token) {
  return request("/api/drive/files", { method: "GET", token });
}

export function listBlobFiles(token) {
  return request("/api/blob/files", { method: "GET", token });
}

export function transferFiles(token) {
  return request("/api/transfer", { method: "POST", token });
}
