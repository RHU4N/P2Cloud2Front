const API_URL = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");

async function request(path, { method = "GET" } = {}) {
  if (!API_URL) {
    throw new Error("URL da API (VITE_API_URL) não configurada.");
  }

  const headers = {
    Accept: "application/json",
  };

  if (method === "POST") {
    headers["Content-Type"] = "application/json";
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

export function listDriveFiles() {
  return request("/api/drive/files", { method: "GET" });
}

export function listBlobFiles() {
  return request("/api/blob/files", { method: "GET" });
}

export function transferFiles() {
  return request("/api/transfer", { method: "POST" });
}
