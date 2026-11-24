import { useEffect, useRef, useState } from "react";
import { checkHealth, listDriveFiles, listBlobFiles, transferFiles } from "./services/api";

function formatSize(size) {
  if (size === null || size === undefined) return "—";
  const bytes = Number(size);
  if (Number.isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

const RESULT_LABELS = {
  success: "Copiado",
  error: "Erro",
  ignored: "Ignorado",
};

export default function App() {
  const [health, setHealth] = useState("checking");
  const [driveFiles, setDriveFiles] = useState(null);
  const [blobFiles, setBlobFiles] = useState(null);
  const [blobContainer, setBlobContainer] = useState("aluno-rhuan");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [draggingIds, setDraggingIds] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [busy, setBusy] = useState("");
  const [errors, setErrors] = useState({});
  const [summary, setSummary] = useState(null);

  const busyRef = useRef(false);
  const dragDepthRef = useRef(0);

  async function refreshDrive() {
    const data = await listDriveFiles();
    const files = data.files || [];
    setDriveFiles(files);
    setSelectedIds((prev) => {
      const validIds = new Set(files.map((item) => item.id));
      const next = new Set();
      for (const id of prev) {
        if (validIds.has(id)) next.add(id);
      }
      return next;
    });
  }

  async function refreshBlob() {
    const data = await listBlobFiles();
    setBlobFiles(data.files || []);
    if (data.container) {
      setBlobContainer(data.container);
    }
  }

  useEffect(() => {
    const controller = new AbortController();

    checkHealth(controller.signal)
      .then((data) => setHealth(data.status === "ok" ? "online" : "offline"))
      .catch((error) => {
        if (error.name !== "AbortError") setHealth("offline");
      });

    refreshDrive().catch((error) => {
      setErrors((prev) => ({ ...prev, drive: error.message }));
    });

    refreshBlob().catch((error) => {
      setErrors((prev) => ({ ...prev, blob: error.message }));
    });

    return () => controller.abort();
  }, []);

  async function run(action, fileIds = null) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(action);
    setErrors((prev) => ({ ...prev, [action]: "" }));

    try {
      if (action === "drive") {
        await refreshDrive();
      } else if (action === "blob") {
        await refreshBlob();
      } else {
        setSummary(null);
        const result = await transferFiles(fileIds);
        setSummary(result);
        setSelectedIds(new Set());
        try {
          await refreshBlob();
        } catch {
          // Mantém o resumo visível caso a atualização automática do Azure falhe.
        }
      }
      setHealth("online");
    } catch (error) {
      setErrors((prev) => ({ ...prev, [action]: error.message }));
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  }

  function toggleFile(id) {
    if (busy) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllDrive() {
    if (!driveFiles || busy) return;
    setSelectedIds(new Set(driveFiles.map((file) => file.id)));
  }

  function clearSelection() {
    if (busy) return;
    setSelectedIds(new Set());
  }

  function handleDragStart(event, file) {
    if (busy) {
      event.preventDefault();
      return;
    }

    const idsToDrag = selectedIds.has(file.id) ? Array.from(selectedIds) : [file.id];
    setDraggingIds(idsToDrag);
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/json", JSON.stringify(idsToDrag));
    event.dataTransfer.setData("text/plain", idsToDrag.join(","));
  }

  function handleDragEnd() {
    dragDepthRef.current = 0;
    setDraggingIds([]);
    setIsDragOver(false);
  }

  function handleAzureDragEnter(event) {
    if (!event.dataTransfer || busy) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragOver(true);
  }

  function handleAzureDragOver(event) {
    if (!event.dataTransfer || busy) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!isDragOver) setIsDragOver(true);
  }

  function handleAzureDragLeave() {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragOver(false);
    }
  }

  function handleAzureDrop(event) {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragOver(false);

    if (busyRef.current) {
      setDraggingIds([]);
      return;
    }

    let droppedIds = [];
    const jsonPayload = event.dataTransfer.getData("application/json");
    if (jsonPayload) {
      try {
        const parsed = JSON.parse(jsonPayload);
        if (Array.isArray(parsed)) {
          droppedIds = parsed.filter(Boolean);
        }
      } catch {
        droppedIds = [];
      }
    }

    if (!droppedIds.length) {
      const textPayload = event.dataTransfer.getData("text/plain");
      if (textPayload) {
        droppedIds = textPayload
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
      }
    }

    if (!droppedIds.length && draggingIds.length > 0) {
      droppedIds = draggingIds;
    }

    setDraggingIds([]);

    if (droppedIds.length > 0) {
      run("transfer", droppedIds);
    }
  }

  const allSelected = Boolean(driveFiles && driveFiles.length > 0 && selectedIds.size === driveFiles.length);
  const selectedArray = Array.from(selectedIds);
  const disabled = Boolean(busy);
  const healthText = {
    checking: "Verificando API",
    online: "API online",
    offline: "API indisponível",
  }[health];

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#">
            <span className="brand-mark" aria-hidden="true">
              ⇄
            </span>{" "}
            entre<span>nuvens</span>
          </a>
          <span className={`api-status ${health}`} role="status">
            <i aria-hidden="true" />
            {healthText}
          </span>
        </div>
      </header>

      <main>
        <section className="intro">
          <p className="eyebrow">
            COMPUTAÇÃO EM NUVEM II <span>/</span> P2 · RHUAN
          </p>
          <h1>
            Do Drive para o Azure.
            <br />
            <span>Seus arquivos, conectados.</span>
          </h1>
          <p className="intro-copy">
            Consulte sua pasta, escolha quais arquivos enviar ou arraste direto para o contêiner do Azure.
          </p>
          <div className="route" aria-label="Origem Google Drive, destino Azure Blob Storage">
            <span>
              <i className="source-dot" />
              Google Drive
            </span>
            <b aria-hidden="true">→</b>
            <span>
              <i className="destination-dot" />
              Azure Blob Storage
            </span>
          </div>
        </section>

        <div className="files-grid">
          <section className="file-card" aria-labelledby="drive-heading" aria-busy={busy === "drive"}>
            <div className="card-title">
              <div className="provider-icon drive-icon" aria-hidden="true">
                △
              </div>
              <div>
                <p className="eyebrow">01 / ORIGEM</p>
                <h2 id="drive-heading">Google Drive</h2>
              </div>
              <span className="file-count">
                {driveFiles === null ? "—" : driveFiles.length} arquivos
              </span>
            </div>

            <p className="card-description">
              Marque os arquivos desejados ou arraste uma linha até o card do Azure.
            </p>

            <button
              className="secondary-button"
              disabled={disabled}
              onClick={() => run("drive")}
            >
              {busy === "drive" ? "Consultando Drive…" : "Listar arquivos do Drive"}
              <span aria-hidden="true">↻</span>
            </button>

            {errors.drive && (
              <p className="error-message" role="alert">
                {errors.drive}
              </p>
            )}

            {driveFiles === null ? (
              <div className="empty-state">
                <span aria-hidden="true">▤</span>
                <p>Seus arquivos aparecem aqui</p>
                <small>Use o botão acima para consultar a pasta de origem.</small>
              </div>
            ) : !driveFiles.length ? (
              <p className="empty-state">Nenhum arquivo encontrado na pasta.</p>
            ) : (
              <>
                <div className="selection-toolbar">
                  <span>
                    {selectedIds.size > 0
                      ? `${selectedIds.size} selecionado(s)`
                      : "Nenhum selecionado (envia todos)"}
                  </span>
                  <div className="selection-actions">
                    <button
                      type="button"
                      className="link-button"
                      disabled={disabled || allSelected}
                      onClick={selectAllDrive}
                    >
                      Selecionar todos
                    </button>
                    {selectedIds.size > 0 && (
                      <button
                        type="button"
                        className="link-button"
                        disabled={disabled}
                        onClick={clearSelection}
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                </div>

                <div className="table-scroll">
                  <table>
                    <caption className="sr-only">Arquivos do Google Drive</caption>
                    <thead>
                      <tr>
                        <th scope="col" className="select-col">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            disabled={disabled}
                            onChange={() => (allSelected ? clearSelection() : selectAllDrive())}
                            aria-label="Selecionar todos os arquivos do Drive"
                          />
                        </th>
                        <th scope="col">Nome / tipo</th>
                        <th scope="col">Tamanho</th>
                      </tr>
                    </thead>
                    <tbody>
                      {driveFiles.map((file) => {
                        const isSelected = selectedIds.has(file.id);
                        const isDragging = draggingIds.includes(file.id);

                        return (
                          <tr
                            key={file.id}
                            draggable={!disabled}
                            onDragStart={(event) => handleDragStart(event, file)}
                            onDragEnd={handleDragEnd}
                            className={`draggable-row ${isSelected ? "selected-row" : ""} ${
                              isDragging ? "dragging-row" : ""
                            }`}
                          >
                            <td className="select-col">
                              <div className="row-controls">
                                <span
                                  className="drag-handle"
                                  aria-hidden="true"
                                  title="Arraste para o card do Azure"
                                >
                                  ⋮⋮
                                </span>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={disabled}
                                  onChange={() => toggleFile(file.id)}
                                  aria-label={`Selecionar ${file.name}`}
                                />
                              </div>
                            </td>
                            <td>
                              <strong>{file.name}</strong>
                              <small>{file.mimeType}</small>
                              <small className="file-id">ID: {file.id}</small>
                            </td>
                            <td>{formatSize(file.size)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <section
            className={`file-card azure-dropzone ${draggingIds.length > 0 ? "drop-ready" : ""} ${
              isDragOver ? "drag-over" : ""
            }`}
            aria-labelledby="blob-heading"
            aria-busy={busy === "blob" || busy === "transfer"}
            onDragEnter={handleAzureDragEnter}
            onDragOver={handleAzureDragOver}
            onDragLeave={handleAzureDragLeave}
            onDrop={handleAzureDrop}
          >
            <div className="card-title">
              <div className="provider-icon azure-icon" aria-hidden="true">
                ◇
              </div>
              <div>
                <p className="eyebrow">02 / DESTINO</p>
                <h2 id="blob-heading">Azure Blob Storage</h2>
              </div>
              <span className="file-count">
                {blobFiles === null ? "—" : blobFiles.length} arquivos
              </span>
            </div>

            <p className="card-description">
              Contêiner <code>{blobContainer}</code> · conta stop2nuvem2
            </p>

            <button
              className="secondary-button"
              disabled={disabled}
              onClick={() => run("blob")}
            >
              {busy === "blob" ? "Consultando Azure…" : "Listar arquivos do Azure"}
              <span aria-hidden="true">↻</span>
            </button>

            {(draggingIds.length > 0 || isDragOver) && (
              <div className={`drop-indicator ${isDragOver ? "active" : ""}`} role="status">
                {isDragOver
                  ? `Solte para copiar ${draggingIds.length || 1} arquivo(s) para ${blobContainer}`
                  : `Arraste até aqui para copiar ${draggingIds.length || 1} arquivo(s)`}
              </div>
            )}

            {errors.blob && (
              <p className="error-message" role="alert">
                {errors.blob}
              </p>
            )}

            {blobFiles === null ? (
              <div className="empty-state">
                <span aria-hidden="true">▤</span>
                <p>Seus arquivos aparecem aqui</p>
                <small>Use o botão acima para consultar o contêiner de destino.</small>
              </div>
            ) : !blobFiles.length ? (
              <p className="empty-state">Nenhum arquivo encontrado no contêiner.</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <caption className="sr-only">Arquivos do Azure Blob Storage</caption>
                  <thead>
                    <tr>
                      <th scope="col">Nome</th>
                      <th scope="col">Tamanho</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blobFiles.map((file) => (
                      <tr key={file.id || file.name}>
                        <td>
                          <strong>{file.name}</strong>
                        </td>
                        <td>{formatSize(file.size)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <section
          className="migration"
          aria-labelledby="migration-heading"
          aria-busy={busy === "transfer"}
        >
          <div className="migration-callout">
            <div>
              <p className="eyebrow">03 / TRANSFERÊNCIA</p>
              <h2 id="migration-heading">Pronto para atravessar?</h2>
              <p>
                {selectedArray.length > 0
                  ? `${selectedArray.length} arquivo(s) selecionado(s) pronto(s) para envio ao Azure.`
                  : "Copie todos os arquivos da pasta ou selecione apenas os desejados acima."}
                <br />
                Os originais são preservados e arquivos existentes no Azure são ignorados.
              </p>
            </div>
            <div className="migration-actions">
              {selectedArray.length > 0 ? (
                <>
                  <button
                    className="primary-button"
                    disabled={disabled}
                    onClick={() => run("transfer", selectedArray)}
                  >
                    {busy === "transfer"
                      ? "Migrando selecionados…"
                      : `Migrar selecionados (${selectedArray.length})`}
                    <span aria-hidden="true">→</span>
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={disabled}
                    onClick={() => run("transfer")}
                  >
                    Migrar todos
                  </button>
                </>
              ) : (
                <button
                  className="primary-button"
                  disabled={disabled}
                  onClick={() => run("transfer")}
                >
                  {busy === "transfer" ? "Migrando arquivos…" : "Migrar arquivos"}
                  <span aria-hidden="true">→</span>
                </button>
              )}
            </div>
          </div>

          <div className="migration-details">
            <p className="migration-hint" role="status">
              {busy === "transfer"
                ? "Transferência em andamento. Aguarde o resumo e mantenha a página aberta."
                : "Dica: você também pode arrastar arquivos da lista do Drive e soltar direto no card do Azure."}
            </p>

            {errors.transfer && (
              <p className="error-message" role="alert">
                {errors.transfer}
              </p>
            )}

            {summary && (
              <div className="results" aria-live="polite">
                <div className="results-heading">
                  <h3>Migração finalizada</h3>
                  <span>{summary.summary?.total ?? 0} arquivo(s) processado(s)</span>
                </div>

                <dl className="summary">
                  <div>
                    <dt>Copiados</dt>
                    <dd>{summary.summary?.uploaded ?? 0}</dd>
                  </div>
                  <div>
                    <dt>Com erro</dt>
                    <dd>{summary.summary?.errors ?? 0}</dd>
                  </div>
                  <div>
                    <dt>Ignorados</dt>
                    <dd>{summary.summary?.ignored ?? 0}</dd>
                  </div>
                </dl>

                <p className="result-note">Listagem do Azure atualizada automaticamente.</p>

                {summary.files && summary.files.length > 0 && (
                  <div className="table-scroll">
                    <table>
                      <caption className="sr-only">Resultado de cada transferência</caption>
                      <thead>
                        <tr>
                          <th scope="col">Arquivo</th>
                          <th scope="col">Resultado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.files.map((result) => (
                          <tr key={result.id || result.name}>
                            <td>
                              <strong>{result.name}</strong>
                            </td>
                            <td>
                              <span className={`result-badge ${result.status}`}>
                                {RESULT_LABELS[result.status] || result.status}
                              </span>
                              <small>{result.message}</small>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <footer>
          <span>
            entre nuvens <span aria-hidden="true">↗</span>
          </span>
          <p>Google Drive → Azure Blob Storage · Projeto acadêmico</p>
        </footer>
      </main>
    </>
  );
}
