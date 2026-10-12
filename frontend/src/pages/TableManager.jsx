// TableManager.jsx: Owner table management with QR display, token rotation, and safe deletion
import React, { useState, useEffect, useRef, useId } from 'react';
import Button from '../Components/Common/Button.jsx';
import ErrorMessage from '../Components/Common/ErrorMessage.jsx';
import Loader from '../Components/Common/Loader.jsx';
import Modal from '../Components/Common/Modal.jsx';
import TableCard from '../Components/Owner/TableCard.jsx';
import QRDisplay from '../Components/Owner/QRDisplay.jsx';
import {
  fetchTables,
  createTable,
  fetchTableQR,
  rotateTableToken,
  deleteTable,
} from '../services/tableService.js';
import { LIMITS } from '../utils/menuOptions.js';
import { MESSAGES } from '../utils/messages.js';

export const TableManager = () => {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tableNumberInput, setTableNumberInput] = useState('');
  const [formError, setFormError] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [pageError, setPageError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Modals: null | { type: 'qr', table, qrData } | { type: 'rotate', table } | { type: 'delete', table }
  const [activeModal, setActiveModal] = useState(null);

  const inputId = useId();
  const isMountedRef = useRef(true);

  const loadTables = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await fetchTables();
      if (!isMountedRef.current) return;
      setTables(data);
      setLoading(false);
    } catch {
      if (!isMountedRef.current) return;
      setLoadError(true);
      setLoading(false);
    }
  };

  const reFetchTables = async () => {
    try {
      const data = await fetchTables();
      if (!isMountedRef.current) return;
      setTables(data);
      setLoadError(false);
    } catch {
      if (!isMountedRef.current) return;
      setLoadError(true);
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    loadTables();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const clearAlerts = () => {
    setStatusMessage(null);
    setPageError(null);
    setFormError(null);
  };

  // Add table form submit
  const handleAddTable = async (e) => {
    e.preventDefault();
    clearAlerts();

    const trimmed = tableNumberInput.trim();
    if (!/^\d{1,3}$/.test(trimmed)) {
      setFormError(MESSAGES.owner.tables.errors.invalidNumber);
      return;
    }
    const num = Number(trimmed);
    if (num < 1 || num > LIMITS.tableMax) {
      setFormError(MESSAGES.owner.tables.errors.invalidNumber);
      return;
    }

    setBusy(true);
    try {
      await createTable(num);
      if (!isMountedRef.current) return;
      setTableNumberInput('');
      setBusy(false);
      await reFetchTables();
      if (!isMountedRef.current) return;
      setStatusMessage(MESSAGES.owner.tables.notes.added(num));
    } catch (err) {
      if (!isMountedRef.current) return;
      setBusy(false);
      const status = err?.response?.status;
      if (status === 409) {
        setPageError(MESSAGES.owner.tables.errors.alreadyExists(num));
      } else if (status === 400) {
        setFormError(MESSAGES.owner.tables.errors.invalidNumber);
      } else {
        setPageError(MESSAGES.owner.tables.errors.generic);
      }
    }
  };

  // Show QR
  const handleShowQr = async (table) => {
    if (busy) return;
    setBusy(true);
    clearAlerts();
    try {
      const qrData = await fetchTableQR(table.id);
      if (!isMountedRef.current) return;
      setBusy(false);
      setActiveModal({ type: 'qr', table, qrData });
    } catch {
      if (!isMountedRef.current) return;
      setBusy(false);
      setPageError(MESSAGES.owner.tables.errors.qrLoadFailed);
    }
  };

  // Replace QR flow
  const handleOpenRotate = (table) => {
    clearAlerts();
    setActiveModal({ type: 'rotate', table });
  };

  const handleConfirmRotate = async () => {
    if (!activeModal?.table) return;
    const table = activeModal.table;
    setBusy(true);

    try {
      await rotateTableToken(table.id);
    } catch (err) {
      if (!isMountedRef.current) return;
      setBusy(false);
      setActiveModal(null);
      const status = err?.response?.status;
      if (status === 404) {
        setPageError(MESSAGES.owner.tables.errors.notFound);
        await reFetchTables();
      } else {
        setPageError(MESSAGES.owner.tables.errors.generic);
      }
      return;
    }

    try {
      const qrData = await fetchTableQR(table.id);
      if (!isMountedRef.current) return;
      await reFetchTables();
      if (!isMountedRef.current) return;
      setBusy(false);
      setActiveModal({ type: 'qr', table, qrData });
    } catch (err) {
      if (!isMountedRef.current) return;
      setActiveModal(null);
      setBusy(false);
      await reFetchTables();
      if (!isMountedRef.current) return;
      setPageError(MESSAGES.owner.tables.errors.replacedQrLoadFailed);
    }
  };

  // Delete flow
  const handleOpenDelete = (table) => {
    clearAlerts();
    setActiveModal({ type: 'delete', table });
  };

  const handleConfirmDelete = async () => {
    if (!activeModal?.table) return;
    const table = activeModal.table;
    setBusy(true);
    try {
      await deleteTable(table.id);
      if (!isMountedRef.current) return;
      setActiveModal(null);
      setBusy(false);
      await reFetchTables();
      if (!isMountedRef.current) return;
      setStatusMessage(MESSAGES.owner.tables.notes.deleted(table.number));
    } catch (err) {
      if (!isMountedRef.current) return;
      setBusy(false);
      const status = err?.response?.status;
      if (status === 409) {
        setActiveModal(null);
        setPageError(MESSAGES.owner.tables.deleteBlocked);
      } else if (status === 404) {
        setActiveModal(null);
        await reFetchTables();
      } else {
        setActiveModal(null);
        setPageError(MESSAGES.owner.tables.errors.generic);
      }
    }
  };

  return (
    <div className="page-content table-manager">
      <h1 className="page-title">{MESSAGES.nav.tables}</h1>

      {loading ? (
        <Loader />
      ) : loadError && tables.length === 0 ? (
        <div className="error-container">
          <ErrorMessage>{MESSAGES.owner.tables.errors.loadFailed}</ErrorMessage>
          <Button variant="primary" onClick={loadTables}>
            {MESSAGES.common.tryAgain}
          </Button>
        </div>
      ) : (
        <>
          {loadError && (
            <div className="error-container">
              <ErrorMessage>{MESSAGES.owner.tables.errors.loadFailed}</ErrorMessage>
              <Button variant="primary" onClick={loadTables}>
                {MESSAGES.common.tryAgain}
              </Button>
            </div>
          )}

          {statusMessage && (
            <div role="status" className="status-note">
              {statusMessage}
            </div>
          )}

          {pageError && <ErrorMessage>{pageError}</ErrorMessage>}

          <form onSubmit={handleAddTable} noValidate className="add-table-form">
            <div className="field">
              <label htmlFor={inputId} className="field-label">
                {MESSAGES.owner.tables.tableNumberLabel}
              </label>
              <div className="add-table-input-group">
                <input
                  id={inputId}
                  type="text"
                  inputMode="numeric"
                  className="field-input add-table-input"
                  value={tableNumberInput}
                  disabled={busy}
                  aria-invalid={formError ? 'true' : undefined}
                  aria-describedby={formError ? `${inputId}-error` : undefined}
                  onChange={(e) => setTableNumberInput(e.target.value)}
                />
                <Button
                  type="submit"
                  variant="primary"
                  disabled={busy}
                  loading={busy}
                >
                  {MESSAGES.owner.tables.addTable}
                </Button>
              </div>
              {formError && (
                <div id={`${inputId}-error`} role="alert" className="field-error">
                  {formError}
                </div>
              )}
            </div>
          </form>

          {tables.length === 0 ? (
            <p className="empty-state">{MESSAGES.owner.tables.emptyState}</p>
          ) : (
            <div className="table-grid">
              {tables.map((tbl) => (
                <TableCard
                  key={tbl.id}
                  table={tbl}
                  busy={busy}
                  onShowQr={handleShowQr}
                  onRotate={handleOpenRotate}
                  onDelete={handleOpenDelete}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Show QR Modal */}
      {activeModal?.type === 'qr' && activeModal.table && activeModal.qrData && (
        <Modal
          title={MESSAGES.owner.tables.tableHeading(activeModal.table.number)}
          busy={busy}
          onClose={() => {
            if (!busy) setActiveModal(null);
          }}
        >
          <QRDisplay
            number={activeModal.table.number}
            url={activeModal.qrData.url}
            qrDataUrl={activeModal.qrData.qrDataUrl}
          />
        </Modal>
      )}

      {/* Rotate Confirm Modal */}
      {activeModal?.type === 'rotate' && activeModal.table && (
        <Modal
          title={MESSAGES.owner.tables.rotateModalTitle(activeModal.table.number)}
          busy={busy}
          onClose={() => {
            if (!busy) setActiveModal(null);
          }}
        >
          <p className="dialog-body-text">{MESSAGES.owner.tables.rotateBody}</p>
          <div className="form-actions">
            <Button
              variant="primary"
              disabled={busy}
              loading={busy}
              onClick={handleConfirmRotate}
            >
              {MESSAGES.owner.tables.rotateConfirm}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setActiveModal(null)}
            >
              {MESSAGES.common.cancel}
            </Button>
          </div>
        </Modal>
      )}

      {/* Delete Confirm Modal */}
      {activeModal?.type === 'delete' && activeModal.table && (
        <Modal
          title={MESSAGES.owner.tables.deleteModalTitle(activeModal.table.number)}
          busy={busy}
          onClose={() => {
            if (!busy) setActiveModal(null);
          }}
        >
          <p className="dialog-body-text">{MESSAGES.owner.tables.deleteModalBody}</p>
          <div className="form-actions">
            <Button
              variant="primary"
              disabled={busy}
              loading={busy}
              onClick={handleConfirmDelete}
            >
              {MESSAGES.owner.tables.deleteConfirm}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setActiveModal(null)}
            >
              {MESSAGES.common.cancel}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default TableManager;
