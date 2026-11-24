import { useEffect, useRef, useState } from "react";
import {
  checkHealth,
  listDriveFiles,
  listBlobFiles,
  transferDriveToBlob,
  transferBlobToDrive,
  uploadToBlob,
  uploadToDrive,
  deleteDriveFiles,
  deleteBlobFiles,
} from "./services/api";

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
  deleted: "Excluído",
  error: "Erro",
  ignored: "Ignorado",
};

const OPERATION_TITLES = {
  "drive-to-blob": "Drive → Azure",
  "blob-to-drive": "Azure → Drive",
  "upload-blob": "Upload → Azure",
  "upload-drive": "Upload → Google Drive",
  "delete-drive": "Exclusão · Google Drive",
  "delete-blob": "Exclusão · Azure Blob Storage",
};

function hasNativeFiles(dataTransfer) {
  return Array.from(dataTransfer?.types || []).includes("Files");
}

function getFileSignature(file) {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

export default function App() {
  const [health, setHealth] = useState("checking");
  const [driveFiles, setDriveFiles] = useState(null);
  const [blobFiles, setBlobFiles] = useState(null);
  const [blobContainer, setBlobContainer] = useState("aluno-rhuan");

  const [selectedDriveIds, setSelectedDriveIds] = useState(() => new Set());
  const [selectedBlobNames, setSelectedBlobNames] = useState(() => new Set());
  const [queuedFiles, setQueuedFiles] = useState([]);

  const [dragState, setDragState] = useState(null);
  const [driveDragOver, setDriveDragOver] = useState(false);
  const [azureDragOver, setAzureDragOver] = useState(false);
  const [uploadDragOver, setUploadDragOver] = useState(false);

  const [busy, setBusy] = useState("");
  const [errors, setErrors] = useState({});
  const [summary, setSummary] = useState(null);
  const [lastOperation, setLastOperation] = useState("");

  const busyRef = useRef(false);
  const fileInputRef = useRef(null);
  const driveDragDepthRef = useRef(0);
  const azureDragDepthRef = useRef(0);
  const uploadDragDepthRef = useRef(0);

  async function refreshDrive() {
    const data = await listDriveFiles();
    const files = data.files || [];
    setDriveFiles(files);
    setSelectedDriveIds((prev) => {
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
    const files = data.files || [];
    setBlobFiles(files);
    if (data.container) {
      setBlobContainer(data.container);
    }
    setSelectedBlobNames((prev) => {
      const validNames = new Set(files.map((item) => item.name));
      const next = new Set();
      for (const name of prev) {
        if (validNames.has(name)) next.add(name);
      }
      return next;
    });
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

  async function run(action, payload = null) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(action);

    const errorKey =
      action === "drive" || action === "blob"
        ? action
        : action.startsWith("upload")
        ? "upload"
        : "transfer";

    setErrors((prev) => ({ ...prev, [errorKey]: "" }));

    try {
      if (action === "drive") {
        await refreshDrive();
      } else if (action === "blob") {
        await refreshBlob();
      } else if (action === "drive-to-blob") {
        setSummary(null);
        const result = await transferDriveToBlob(payload);
        setSummary(result);
        setLastOperation("drive-to-blob");
        setSelectedDriveIds(new Set());
        try {
          await refreshBlob();
        } catch {
          // Mantém o resultado mesmo se o refresh falhar.
        }
      } else if (action === "blob-to-drive") {
        setSummary(null);
        const result = await transferBlobToDrive(payload);
        setSummary(result);
        setLastOperation("blob-to-drive");
        setSelectedBlobNames(new Set());
        try {
          await refreshDrive();
        } catch {
          // Mantém o resultado mesmo se o refresh falhar.
        }
      } else if (action === "upload-blob") {
        setSummary(null);
        const filesToSend = payload || queuedFiles;
        const result = await uploadToBlob(filesToSend);
        setSummary(result);
        setLastOperation("upload-blob");
        if (!payload) {
          setQueuedFiles([]);
        }
        try {
          await refreshBlob();
        } catch {
          // Mantém o resultado mesmo se o refresh falhar.
        }
      } else if (action === "upload-drive") {
        setSummary(null);
        const filesToSend = payload || queuedFiles;
        const result = await uploadToDrive(filesToSend);
        setSummary(result);
        setLastOperation("upload-drive");
        if (!payload) {
          setQueuedFiles([]);
        }
        try {
          await refreshDrive();
        } catch {
          // Mantém o resultado mesmo se o refresh falhar.
        }
      } else if (action === "delete-drive") {
        setSummary(null);
        const result = await deleteDriveFiles(payload);
        setSummary(result);
        setLastOperation("delete-drive");
        setSelectedDriveIds(new Set());
        try {
          await refreshDrive();
        } catch {
          // Mantém o resultado mesmo se o refresh falhar.
        }
      } else if (action === "delete-blob") {
        setSummary(null);
        const result = await deleteBlobFiles(payload);
        setSummary(result);
        setLastOperation("delete-blob");
        setSelectedBlobNames(new Set());
        try {
          await refreshBlob();
        } catch {
          // Mantém o resultado mesmo se o refresh falhar.
        }
      }

      setHealth("online");
    } catch (error) {
      setErrors((prev) => ({ ...prev, [errorKey]: error.message }));
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  }

  function toggleDriveFile(id) {
    if (busy) return;
    setSelectedDriveIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleBlobFile(name) {
    if (busy) return;
    setSelectedBlobNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function confirmAndDelete(target, items, displayLabel) {
    if (busy || !items || items.length === 0) return;
    const cloudName = target === "drive" ? "Google Drive" : "Azure Blob Storage";
    const subject =
      items.length === 1
        ? `o arquivo "${displayLabel}"`
        : `os ${items.length} arquivos selecionados`;
    if (!window.confirm(`Deseja realmente apagar ${subject} de ${cloudName}?`)) {
      return;
    }
    run(target === "drive" ? "delete-drive" : "delete-blob", items);
  }

  function appendQueuedFiles(fileList) {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    setQueuedFiles((prev) => {
      const seen = new Set(prev.map(getFileSignature));
      const merged = [...prev];
      for (const file of incoming) {
        const sig = getFileSignature(file);
        if (!seen.has(sig)) {
          seen.add(sig);
          merged.push(file);
        }
      }
      return merged;
    });
  }

  function removeQueuedFile(indexToRemove) {
    setQueuedFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  }

  function handleDriveRowDragStart(event, file) {
    if (busy) {
      event.preventDefault();
      return;
    }
    const items = selectedDriveIds.has(file.id) ? Array.from(selectedDriveIds) : [file.id];
    setDragState({ source: "drive", items });
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-entrename-drive", JSON.stringify(items));
    event.dataTransfer.setData("text/plain", items.join(","));
  }

  function handleBlobRowDragStart(event, file) {
    if (busy) {
      event.preventDefault();
      return;
    }
    const items = selectedBlobNames.has(file.name) ? Array.from(selectedBlobNames) : [file.name];
    setDragState({ source: "blob", items });
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-entrename-blob", JSON.stringify(items));
    event.dataTransfer.setData("text/plain", items.join(","));
  }

  function resetAllDragStates() {
    driveDragDepthRef.current = 0;
    azureDragDepthRef.current = 0;
    uploadDragDepthRef.current = 0;
    setDragState(null);
    setDriveDragOver(false);
    setAzureDragOver(false);
    setUploadDragOver(false);
  }

  function canDropOnDrive(dataTransfer) {
    return dragState?.source === "blob" || hasNativeFiles(dataTransfer);
  }

  function canDropOnAzure(dataTransfer) {
    return dragState?.source === "drive" || hasNativeFiles(dataTransfer);
  }

  function extractDroppedItems(dataTransfer, mimeType, fallbackItems = []) {
    const raw = dataTransfer?.getData(mimeType);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {
        // Ignora payload malformado.
      }
    }
    return fallbackItems;
  }

  function handleDriveCardDragEnter(event) {
    if (busy || !canDropOnDrive(event.dataTransfer)) return;
    event.preventDefault();
    driveDragDepthRef.current += 1;
    setDriveDragOver(true);
  }

  function handleDriveCardDragOver(event) {
    if (busy || !canDropOnDrive(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!driveDragOver) setDriveDragOver(true);
  }

  function handleDriveCardDragLeave() {
    driveDragDepthRef.current = Math.max(0, driveDragDepthRef.current - 1);
    if (driveDragDepthRef.current === 0) setDriveDragOver(false);
  }

  function handleDriveCardDrop(event) {
    if (!canDropOnDrive(event.dataTransfer)) return;
    event.preventDefault();
    const localFiles = Array.from(event.dataTransfer?.files || []);
    const blobItems =
      dragState?.source === "blob"
        ? extractDroppedItems(event.dataTransfer, "application/x-entrename-blob", dragState.items)
        : [];
    resetAllDragStates();

    if (busyRef.current) return;
    if (localFiles.length > 0) {
      run("upload-drive", localFiles);
    } else if (blobItems.length > 0) {
      run("blob-to-drive", blobItems);
    }
  }

  function handleAzureCardDragEnter(event) {
    if (busy || !canDropOnAzure(event.dataTransfer)) return;
    event.preventDefault();
    azureDragDepthRef.current += 1;
    setAzureDragOver(true);
  }

  function handleAzureCardDragOver(event) {
    if (busy || !canDropOnAzure(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!azureDragOver) setAzureDragOver(true);
  }

  function handleAzureCardDragLeave() {
    azureDragDepthRef.current = Math.max(0, azureDragDepthRef.current - 1);
    if (azureDragDepthRef.current === 0) setAzureDragOver(false);
  }

  function handleAzureCardDrop(event) {
    if (!canDropOnAzure(event.dataTransfer)) return;
    event.preventDefault();
    const localFiles = Array.from(event.dataTransfer?.files || []);
    const driveItems =
      dragState?.source === "drive"
        ? extractDroppedItems(event.dataTransfer, "application/x-entrename-drive", dragState.items)
        : [];
    resetAllDragStates();

    if (busyRef.current) return;
    if (localFiles.length > 0) {
      run("upload-blob", localFiles);
    } else if (driveItems.length > 0) {
      run("drive-to-blob", driveItems);
    }
  }

  function handleUploadDragEnter(event) {
    if (busy || !hasNativeFiles(event.dataTransfer)) return;
    event.preventDefault();
    uploadDragDepthRef.current += 1;
    setUploadDragOver(true);
  }

  function handleUploadDragOver(event) {
    if (busy || !hasNativeFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!uploadDragOver) setUploadDragOver(true);
  }

  function handleUploadDragLeave() {
    uploadDragDepthRef.current = Math.max(0, uploadDragDepthRef.current - 1);
    if (uploadDragDepthRef.current === 0) setUploadDragOver(false);
  }

  function handleUploadDrop(event) {
    if (!hasNativeFiles(event.dataTransfer)) return;
    event.preventDefault();
    uploadDragDepthRef.current = 0;
    setUploadDragOver(false);
    if (!busy) {
      appendQueuedFiles(event.dataTransfer.files);
    }
  }

  const allDriveSelected = Boolean(
    driveFiles && driveFiles.length > 0 && selectedDriveIds.size === driveFiles.length
  );
  const allBlobSelected = Boolean(
    blobFiles && blobFiles.length > 0 && selectedBlobNames.size === blobFiles.length
  );
  const selectedDriveArray = Array.from(selectedDriveIds);
  const selectedBlobArray = Array.from(selectedBlobNames);
  const disabled = Boolean(busy);
  const isTransferOrUploadBusy = [
    "drive-to-blob",
    "blob-to-drive",
    "upload-blob",
    "upload-drive",
    "delete-drive",
    "delete-blob",
  ].includes(busy);
  const isDeleteOp = lastOperation === "delete-drive" || lastOperation === "delete-blob";

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
            Drive e Azure em duas mãos.
            <br />
            <span>Envie, selecione ou arraste.</span>
          </h1>
          <p className="intro-copy">
            Transfira arquivos nos dois sentidos entre Google Drive e Azure Blob Storage,
            ou envie arquivos direto do computador para qualquer uma das nuvens.
          </p>
          <div className="route" aria-label="Integração bidirecional Google Drive e Azure Blob Storage">
            <span>
              <i className="source-dot" />
              Google Drive
            </span>
            <b aria-hidden="true">⇄</b>
            <span>
              <i className="destination-dot" />
              Azure Blob Storage
            </span>
          </div>
        </section>

        <div className="files-grid">
          <section
            className={`file-card cloud-dropzone ${
              dragState?.source === "blob" ? "drop-ready" : ""
            } ${driveDragOver ? "drag-over" : ""}`}
            aria-labelledby="drive-heading"
            aria-busy={busy === "drive" || busy === "blob-to-drive" || busy === "upload-drive"}
            onDragEnter={handleDriveCardDragEnter}
            onDragOver={handleDriveCardDragOver}
            onDragLeave={handleDriveCardDragLeave}
            onDrop={handleDriveCardDrop}
          >
            <div className="card-title">
              <div className="provider-icon drive-icon" aria-hidden="true">
                △
              </div>
              <div>
                <p className="eyebrow">01 / GOOGLE DRIVE</p>
                <h2 id="drive-heading">Google Drive</h2>
              </div>
              <span className="file-count">
                {driveFiles === null ? "—" : driveFiles.length} arquivos
              </span>
            </div>

            <p className="card-description">
              Arraste daqui para o Azure, ou solte aqui arquivos do Azure / computador.
            </p>

            <button className="secondary-button" disabled={disabled} onClick={() => run("drive")}>
              {busy === "drive" ? "Consultando Drive…" : "Listar arquivos do Drive"}
              <span aria-hidden="true">↻</span>
            </button>

            {(dragState?.source === "blob" || driveDragOver) && (
              <div className={`drop-indicator ${driveDragOver ? "active" : ""}`} role="status">
                {driveDragOver
                  ? dragState?.source === "blob"
                    ? `Solte para copiar ${dragState.items.length} arquivo(s) para o Google Drive`
                    : "Solte os arquivos do computador para enviar ao Google Drive"
                  : `Arraste até aqui para copiar ${dragState.items.length} arquivo(s) ao Drive`}
              </div>
            )}

            {errors.drive && (
              <p className="error-message" role="alert">
                {errors.drive}
              </p>
            )}

            {driveFiles === null ? (
              <div className="empty-state">
                <span aria-hidden="true">▤</span>
                <p>Seus arquivos aparecem aqui</p>
                <small>Use o botão acima para consultar a pasta no Google Drive.</small>
              </div>
            ) : !driveFiles.length ? (
              <p className="empty-state">Nenhum arquivo encontrado na pasta.</p>
            ) : (
              <>
                <div className="selection-toolbar">
                  <span>
                    {selectedDriveIds.size > 0
                      ? `${selectedDriveIds.size} selecionado(s)`
                      : "Nenhum selecionado (envia todos)"}
                  </span>
                  <div className="selection-actions">
                    <button
                      type="button"
                      className="link-button"
                      disabled={disabled || allDriveSelected}
                      onClick={() =>
                        setSelectedDriveIds(new Set(driveFiles.map((file) => file.id)))
                      }
                    >
                      Selecionar todos
                    </button>
                    {selectedDriveIds.size > 0 && (
                      <>
                        <button
                          type="button"
                          className="link-button"
                          disabled={disabled}
                          onClick={() => setSelectedDriveIds(new Set())}
                        >
                          Limpar
                        </button>
                        <button
                          type="button"
                          className="link-button danger-link-button"
                          disabled={disabled}
                          onClick={() =>
                            confirmAndDelete("drive", selectedDriveArray, selectedDriveArray[0])
                          }
                        >
                          Apagar selecionados ({selectedDriveIds.size})
                        </button>
                      </>
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
                            checked={allDriveSelected}
                            disabled={disabled}
                            onChange={() =>
                              allDriveSelected
                                ? setSelectedDriveIds(new Set())
                                : setSelectedDriveIds(new Set(driveFiles.map((f) => f.id)))
                            }
                            aria-label="Selecionar todos os arquivos do Drive"
                          />
                        </th>
                        <th scope="col">Nome / tipo</th>
                        <th scope="col">Tamanho</th>
                      </tr>
                    </thead>
                    <tbody>
                      {driveFiles.map((file) => {
                        const isSelected = selectedDriveIds.has(file.id);
                        const isDragging =
                          dragState?.source === "drive" && dragState.items.includes(file.id);

                        return (
                          <tr
                            key={file.id}
                            draggable={!disabled}
                            onDragStart={(event) => handleDriveRowDragStart(event, file)}
                            onDragEnd={resetAllDragStates}
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
                                  onChange={() => toggleDriveFile(file.id)}
                                  aria-label={`Selecionar ${file.name}`}
                                />
                              </div>
                            </td>
                            <td>
                              <strong>{file.name}</strong>
                              <small>{file.mimeType}</small>
                              <small className="file-id">ID: {file.id}</small>
                            </td>
                            <td>
                              <div className="size-actions">
                                <span>{formatSize(file.size)}</span>
                                <button
                                  type="button"
                                  className="row-delete-btn"
                                  disabled={disabled}
                                  onClick={() => confirmAndDelete("drive", [file.id], file.name)}
                                  aria-label={`Apagar ${file.name} do Google Drive`}
                                  title="Apagar do Google Drive"
                                >
                                  🗑
                                </button>
                              </div>
                            </td>
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
            className={`file-card cloud-dropzone ${
              dragState?.source === "drive" ? "drop-ready" : ""
            } ${azureDragOver ? "drag-over" : ""}`}
            aria-labelledby="blob-heading"
            aria-busy={busy === "blob" || busy === "drive-to-blob" || busy === "upload-blob"}
            onDragEnter={handleAzureCardDragEnter}
            onDragOver={handleAzureCardDragOver}
            onDragLeave={handleAzureCardDragLeave}
            onDrop={handleAzureCardDrop}
          >
            <div className="card-title">
              <div className="provider-icon azure-icon" aria-hidden="true">
                ◇
              </div>
              <div>
                <p className="eyebrow">02 / AZURE BLOB STORAGE</p>
                <h2 id="blob-heading">Azure Blob Storage</h2>
              </div>
              <span className="file-count">
                {blobFiles === null ? "—" : blobFiles.length} arquivos
              </span>
            </div>

            <p className="card-description">
              Contêiner <code>{blobContainer}</code> · arraste para o Drive ou solte arquivos aqui.
            </p>

            <button className="secondary-button" disabled={disabled} onClick={() => run("blob")}>
              {busy === "blob" ? "Consultando Azure…" : "Listar arquivos do Azure"}
              <span aria-hidden="true">↻</span>
            </button>

            {(dragState?.source === "drive" || azureDragOver) && (
              <div className={`drop-indicator ${azureDragOver ? "active" : ""}`} role="status">
                {azureDragOver
                  ? dragState?.source === "drive"
                    ? `Solte para copiar ${dragState.items.length} arquivo(s) para ${blobContainer}`
                    : `Solte os arquivos do computador para enviar a ${blobContainer}`
                  : `Arraste até aqui para copiar ${dragState.items.length} arquivo(s) ao Azure`}
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
                <small>Use o botão acima para consultar o contêiner no Azure.</small>
              </div>
            ) : !blobFiles.length ? (
              <p className="empty-state">Nenhum arquivo encontrado no contêiner.</p>
            ) : (
              <>
                <div className="selection-toolbar">
                  <span>
                    {selectedBlobNames.size > 0
                      ? `${selectedBlobNames.size} selecionado(s)`
                      : "Nenhum selecionado (envia todos)"}
                  </span>
                  <div className="selection-actions">
                    <button
                      type="button"
                      className="link-button"
                      disabled={disabled || allBlobSelected}
                      onClick={() =>
                        setSelectedBlobNames(new Set(blobFiles.map((file) => file.name)))
                      }
                    >
                      Selecionar todos
                    </button>
                    {selectedBlobNames.size > 0 && (
                      <>
                        <button
                          type="button"
                          className="link-button"
                          disabled={disabled}
                          onClick={() => setSelectedBlobNames(new Set())}
                        >
                          Limpar
                        </button>
                        <button
                          type="button"
                          className="link-button danger-link-button"
                          disabled={disabled}
                          onClick={() =>
                            confirmAndDelete("blob", selectedBlobArray, selectedBlobArray[0])
                          }
                        >
                          Apagar selecionados ({selectedBlobNames.size})
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="table-scroll">
                  <table>
                    <caption className="sr-only">Arquivos do Azure Blob Storage</caption>
                    <thead>
                      <tr>
                        <th scope="col" className="select-col">
                          <input
                            type="checkbox"
                            checked={allBlobSelected}
                            disabled={disabled}
                            onChange={() =>
                              allBlobSelected
                                ? setSelectedBlobNames(new Set())
                                : setSelectedBlobNames(new Set(blobFiles.map((f) => f.name)))
                            }
                            aria-label="Selecionar todos os arquivos do Azure"
                          />
                        </th>
                        <th scope="col">Nome</th>
                        <th scope="col">Tamanho</th>
                      </tr>
                    </thead>
                    <tbody>
                      {blobFiles.map((file) => {
                        const isSelected = selectedBlobNames.has(file.name);
                        const isDragging =
                          dragState?.source === "blob" && dragState.items.includes(file.name);

                        return (
                          <tr
                            key={file.name}
                            draggable={!disabled}
                            onDragStart={(event) => handleBlobRowDragStart(event, file)}
                            onDragEnd={resetAllDragStates}
                            className={`draggable-row ${isSelected ? "selected-row" : ""} ${
                              isDragging ? "dragging-row" : ""
                            }`}
                          >
                            <td className="select-col">
                              <div className="row-controls">
                                <span
                                  className="drag-handle"
                                  aria-hidden="true"
                                  title="Arraste para o card do Google Drive"
                                >
                                  ⋮⋮
                                </span>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={disabled}
                                  onChange={() => toggleBlobFile(file.name)}
                                  aria-label={`Selecionar ${file.name}`}
                                />
                              </div>
                            </td>
                            <td>
                              <strong>{file.name}</strong>
                              {file.contentType && <small>{file.contentType}</small>}
                            </td>
                            <td>
                              <div className="size-actions">
                                <span>{formatSize(file.size)}</span>
                                <button
                                  type="button"
                                  className="row-delete-btn"
                                  disabled={disabled}
                                  onClick={() => confirmAndDelete("blob", [file.name], file.name)}
                                  aria-label={`Apagar ${file.name} do Azure`}
                                  title="Apagar do Azure"
                                >
                                  🗑
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>

        <section className="file-card upload-card" aria-labelledby="upload-heading">
          <div className="card-title">
            <div className="provider-icon upload-icon" aria-hidden="true">
              ↑
            </div>
            <div>
              <p className="eyebrow">03 / ENVIAR DO COMPUTADOR</p>
              <h2 id="upload-heading">Upload direto pelo site</h2>
            </div>
            <span className="file-count">{queuedFiles.length} na fila</span>
          </div>

          <div
            className={`upload-dropzone ${uploadDragOver ? "drag-over" : ""}`}
            onDragEnter={handleUploadDragEnter}
            onDragOver={handleUploadDragOver}
            onDragLeave={handleUploadDragLeave}
            onDrop={handleUploadDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="sr-only"
              onChange={(event) => {
                appendQueuedFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <p>
              {uploadDragOver
                ? "Solte os arquivos aqui para adicionar à fila de envio"
                : "Arraste e solte arquivos aqui ou selecione do computador (também pode soltar direto nos cards acima)."}
            </p>
            <button
              type="button"
              className="secondary-button upload-pick-btn"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
            >
              Selecionar arquivos do computador
              <span aria-hidden="true">+</span>
            </button>
          </div>

          {errors.upload && (
            <p className="error-message" role="alert">
              {errors.upload}
            </p>
          )}

          {queuedFiles.length > 0 && (
            <div className="upload-queue-wrap">
              <div className="selection-toolbar">
                <span>{queuedFiles.length} arquivo(s) pronto(s) para envio</span>
                <button
                  type="button"
                  className="link-button"
                  disabled={disabled}
                  onClick={() => setQueuedFiles([])}
                >
                  Limpar fila
                </button>
              </div>

              <ul className="upload-queue">
                {queuedFiles.map((file, idx) => (
                  <li key={getFileSignature(file)} className="upload-item">
                    <div>
                      <strong>{file.name}</strong>
                      <small>{formatSize(file.size)}</small>
                    </div>
                    <button
                      type="button"
                      className="remove-file-btn"
                      disabled={disabled}
                      onClick={() => removeQueuedFile(idx)}
                      aria-label={`Remover ${file.name}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>

              <div className="upload-actions">
                <button
                  type="button"
                  className="upload-btn upload-btn-azure"
                  disabled={disabled}
                  onClick={() => run("upload-blob")}
                >
                  {busy === "upload-blob"
                    ? "Enviando para o Azure…"
                    : `Enviar para o Azure (${queuedFiles.length})`}
                </button>
                <button
                  type="button"
                  className="upload-btn upload-btn-drive"
                  disabled={disabled}
                  onClick={() => run("upload-drive")}
                >
                  {busy === "upload-drive"
                    ? "Enviando para o Drive…"
                    : `Enviar para o Google Drive (${queuedFiles.length})`}
                </button>
              </div>
            </div>
          )}
        </section>

        <section
          className="migration"
          aria-labelledby="migration-heading"
          aria-busy={isTransferOrUploadBusy}
        >
          <div className="migration-callout">
            <div>
              <p className="eyebrow">04 / TRANSFERÊNCIA ENTRE NUVENS</p>
              <h2 id="migration-heading">Copiar entre Drive e Azure</h2>
              <p>
                Escolha a direção ou arraste uma linha de um card para o outro.
                <br />
                Os originais são preservados e arquivos já existentes no destino são ignorados.
              </p>
            </div>
            <div className="migration-actions">
              <button
                className="primary-button"
                disabled={disabled}
                onClick={() =>
                  run("drive-to-blob", selectedDriveArray.length > 0 ? selectedDriveArray : null)
                }
              >
                {busy === "drive-to-blob"
                  ? "Enviando Drive → Azure…"
                  : selectedDriveArray.length > 0
                  ? `Drive → Azure (${selectedDriveArray.length})`
                  : "Drive → Azure (todos)"}
                <span aria-hidden="true">→</span>
              </button>

              <button
                type="button"
                className="ghost-button"
                disabled={disabled}
                onClick={() =>
                  run("blob-to-drive", selectedBlobArray.length > 0 ? selectedBlobArray : null)
                }
              >
                {busy === "blob-to-drive"
                  ? "Enviando Azure → Drive…"
                  : selectedBlobArray.length > 0
                  ? `Azure → Drive (${selectedBlobArray.length})`
                  : "Azure → Drive (todos)"}
                <span aria-hidden="true">←</span>
              </button>
            </div>
          </div>

          <div className="migration-details">
            <p className="migration-hint" role="status">
              {isTransferOrUploadBusy
                ? "Operação em andamento. Aguarde o resumo e mantenha a página aberta."
                : "Você pode marcar arquivos específicos em qualquer nuvem, arrastar entre os cards ou enviar do computador."}
            </p>

            {errors.transfer && (
              <p className="error-message" role="alert">
                {errors.transfer}
              </p>
            )}

            {summary && (
              <div className="results" aria-live="polite">
                <div className="results-heading">
                  <h3>{OPERATION_TITLES[lastOperation] || summary.message || "Operação finalizada"}</h3>
                  <span>{summary.summary?.total ?? 0} arquivo(s) processado(s)</span>
                </div>

                <dl className="summary">
                  <div>
                    <dt>{isDeleteOp ? "Excluídos" : "Copiados"}</dt>
                    <dd>
                      {isDeleteOp
                        ? summary.summary?.deleted ?? 0
                        : summary.summary?.uploaded ?? 0}
                    </dd>
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

                {summary.files && summary.files.length > 0 && (
                  <div className="table-scroll">
                    <table>
                      <caption className="sr-only">Resultado de cada operação</caption>
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
            entre nuvens <span aria-hidden="true">⇄</span>
          </span>
          <p>Google Drive ⇄ Azure Blob Storage · Projeto acadêmico</p>
        </footer>
      </main>
    </>
  );
}
