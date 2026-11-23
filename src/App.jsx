import { useState } from "react";
import { listDriveFiles, listBlobFiles, transferFiles } from "./services/api";

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) {
    return "—";
  }
  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${units[index]}`;
}

const STATUS_LABEL = {
  success: "Enviado",
  ignored: "Ignorado",
  error: "Erro",
};

export default function App() {
  const [token, setToken] = useState("");
  const [authError, setAuthError] = useState("");

  const [driveFiles, setDriveFiles] = useState([]);
  const [driveLoaded, setDriveLoaded] = useState(false);
  const [loadingDrive, setLoadingDrive] = useState(false);
  const [driveError, setDriveError] = useState("");

  const [blobFiles, setBlobFiles] = useState([]);
  const [blobContainer, setBlobContainer] = useState("");
  const [blobLoaded, setBlobLoaded] = useState(false);
  const [loadingBlob, setLoadingBlob] = useState(false);
  const [blobError, setBlobError] = useState("");

  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [transferResult, setTransferResult] = useState(null);

  function ensureToken() {
    if (!token.trim()) {
      setAuthError("Informe o token administrativo para consultar ou migrar arquivos.");
      return false;
    }
    setAuthError("");
    return true;
  }

  async function handleListDrive() {
    if (!ensureToken()) return;

    setLoadingDrive(true);
    setDriveError("");
    try {
      const data = await listDriveFiles(token);
      setDriveFiles(data.files || []);
      setDriveLoaded(true);
    } catch (err) {
      setDriveError(err.message || "Erro ao listar arquivos do Google Drive.");
    } finally {
      setLoadingDrive(false);
    }
  }

  async function handleListBlob() {
    if (!ensureToken()) return;

    setLoadingBlob(true);
    setBlobError("");
    try {
      const data = await listBlobFiles(token);
      setBlobFiles(data.files || []);
      setBlobContainer(data.container || "");
      setBlobLoaded(true);
    } catch (err) {
      setBlobError(err.message || "Erro ao listar arquivos do Azure Blob Storage.");
    } finally {
      setLoadingBlob(false);
    }
  }

  async function handleTransfer() {
    if (!ensureToken()) return;

    setTransferring(true);
    setTransferError("");
    try {
      const data = await transferFiles(token);
      setTransferResult(data);

      if (data.summary && data.summary.uploaded > 0) {
        try {
          const updatedBlobs = await listBlobFiles(token);
          setBlobFiles(updatedBlobs.files || []);
          setBlobContainer(updatedBlobs.container || "");
          setBlobLoaded(true);
          setBlobError("");
        } catch {
          // Mantém o resultado da transferência mesmo se a atualização automática falhar.
        }
      }
    } catch (err) {
      setTransferError(err.message || "Erro ao migrar arquivos.");
    } finally {
      setTransferring(false);
    }
  }

  return (
    <main className="page">
      <header className="header">
        <h1>Migração Google Drive para Azure Blob Storage</h1>
        <p>
          Aplicação simples para listar arquivos da pasta configurada no Google Drive,
          consultar o contêiner no Azure Blob Storage e copiar os arquivos sem sobrescrever.
        </p>
      </header>

      <section className="card auth-card">
        <div className="auth-row">
          <label htmlFor="admin-token">Token administrativo</label>
          <input
            id="admin-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(event) => {
              setToken(event.target.value);
              if (authError) setAuthError("");
            }}
            placeholder="Informe o token administrativo"
          />
        </div>
        <p className="hint">
          O token permanece somente na memória da página e é enviado no cabeçalho Authorization.
        </p>
        {authError && <p className="message error">{authError}</p>}
      </section>

      <section className="card transfer-card">
        <div className="section-header">
          <div>
            <h2>Transferência</h2>
            <p className="hint">Copia os arquivos do Google Drive para o Azure sem sobrescrever.</p>
          </div>
          <button
            type="button"
            className="btn btn-accent"
            onClick={handleTransfer}
            disabled={transferring}
          >
            {transferring ? "Migrando..." : "Migrar arquivos"}
          </button>
        </div>

        {transferring && (
          <p className="message info">Migrando arquivos do Google Drive para o Azure...</p>
        )}
        {transferError && <p className="message error">{transferError}</p>}

        {transferResult && (
          <div className="transfer-result">
            <div className="summary-grid">
              <div className="summary-box success">
                <span>Enviados</span>
                <strong>{transferResult.summary?.uploaded ?? 0}</strong>
              </div>
              <div className="summary-box ignored">
                <span>Ignorados</span>
                <strong>{transferResult.summary?.ignored ?? 0}</strong>
              </div>
              <div className="summary-box error">
                <span>Falharam</span>
                <strong>{transferResult.summary?.errors ?? 0}</strong>
              </div>
              <div className="summary-box total">
                <span>Total</span>
                <strong>{transferResult.summary?.total ?? 0}</strong>
              </div>
            </div>

            {transferResult.files && transferResult.files.length > 0 ? (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Arquivo</th>
                      <th>Status</th>
                      <th>Detalhes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transferResult.files.map((item) => (
                      <tr key={item.id || item.name}>
                        <td>{item.name}</td>
                        <td>
                          <span className={`badge ${item.status}`}>
                            {STATUS_LABEL[item.status] || item.status}
                          </span>
                        </td>
                        <td>{item.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty">Nenhum arquivo encontrado na pasta de origem.</p>
            )}
          </div>
        )}
      </section>

      <div className="panels-grid">
        <section className="card">
          <div className="section-header">
            <h2>Google Drive</h2>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleListDrive}
              disabled={loadingDrive || transferring}
            >
              {loadingDrive ? "Carregando..." : "Listar arquivos do Drive"}
            </button>
          </div>

          {driveError && <p className="message error">{driveError}</p>}

          {!driveLoaded && !loadingDrive && !driveError && (
            <p className="empty">Clique em "Listar arquivos do Drive" para consultar a pasta.</p>
          )}

          {driveLoaded && driveFiles.length === 0 && !loadingDrive && (
            <p className="empty">Nenhum arquivo encontrado na pasta do Google Drive.</p>
          )}

          {driveFiles.length > 0 && (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Tipo</th>
                    <th>Tamanho</th>
                  </tr>
                </thead>
                <tbody>
                  {driveFiles.map((file) => (
                    <tr key={file.id}>
                      <td>{file.name}</td>
                      <td className="mono">{file.mimeType}</td>
                      <td>{formatBytes(file.size)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <div className="section-header">
            <div>
              <h2>Azure Blob Storage</h2>
              {blobContainer && <p className="hint">Contêiner: {blobContainer}</p>}
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleListBlob}
              disabled={loadingBlob || transferring}
            >
              {loadingBlob ? "Carregando..." : "Listar arquivos do Azure"}
            </button>
          </div>

          {blobError && <p className="message error">{blobError}</p>}

          {!blobLoaded && !loadingBlob && !blobError && (
            <p className="empty">Clique em "Listar arquivos do Azure" para consultar o contêiner.</p>
          )}

          {blobLoaded && blobFiles.length === 0 && !loadingBlob && (
            <p className="empty">Nenhum arquivo encontrado no contêiner do Azure.</p>
          )}

          {blobFiles.length > 0 && (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Tamanho</th>
                  </tr>
                </thead>
                <tbody>
                  {blobFiles.map((file) => (
                    <tr key={file.name}>
                      <td>{file.name}</td>
                      <td>{formatBytes(file.size)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
