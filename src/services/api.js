const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:3001").trim().replace(/\/+$/, "");

async function request(path, { method = "GET", body, signal } = {}) {
  if (!API_URL) {
    throw new Error("URL da API (VITE_API_URL) não configurada.");
  }

  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const headers = {
    Accept: "application/json",
  };

  if (body !== undefined && !isFormData) {
    headers["Content-Type"] = "application/json";
  }

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
      signal,
      cache: "no-store",
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error(
      "Não foi possível conectar à API. Verifique se o backend está online e se a URL e o CORS estão configurados."
    );
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("A API não retornou JSON. Confira a configuração de VITE_API_URL.");
  }

  if (!response.ok) {
    throw new Error((data && data.error) || "Não foi possível concluir a operação.");
  }

  return data;
}

export const checkHealth = (signal) => request("/api/health", { signal });
export const listDriveFiles = () => request("/api/drive/files");
export const listBlobFiles = () => request("/api/blob/files");

export function transferDriveToBlob(fileIds) {
  if (Array.isArray(fileIds) && fileIds.length > 0) {
    return request("/api/transfer", { method: "POST", body: { fileIds } });
  }
  return request("/api/transfer", { method: "POST" });
}

export const transferFiles = transferDriveToBlob;

export function transferBlobToDrive(fileNames) {
  if (Array.isArray(fileNames) && fileNames.length > 0) {
    return request("/api/transfer/blob-to-drive", { method: "POST", body: { fileNames } });
  }
  return request("/api/transfer/blob-to-drive", { method: "POST" });
}

export function uploadToBlob(files) {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
  return request("/api/upload/blob", { method: "POST", body: formData });
}

export function uploadToDrive(files) {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
  return request("/api/upload/drive", { method: "POST", body: formData });
}
