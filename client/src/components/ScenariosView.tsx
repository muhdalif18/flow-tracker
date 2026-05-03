import { useState, useRef, useEffect } from "react";
import { useApp } from "../AppContext";
import { useAuth } from "../AuthContext";
import EvidenceModal from "./EvidenceModal";
import {
  modStatus,
  modStats,
  isGated,
  STATUS_META,
  scenarioStatus,
  scenarioIssueType,
} from "../utils";
import { useConfirm } from "./ConfirmModal";
import type { Flow, Module, Scenario, TestStep } from "../types";

// â"€â"€ Image helpers (multi-screenshot support) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
import { parseImages, serializeImages } from "./diagnosticsHelpers";

const LEGACY_DATE_RE = /^(\d{1,2})\s([A-Za-z]{3})\s(\d{4})$/;
const MONTH_IDX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function toIsoDateInputValue(value: string): string {
  const v = value.trim();
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  const m = v.match(LEGACY_DATE_RE);
  if (!m) return "";

  const day = Number(m[1]);
  const mon = MONTH_IDX[m[2].toLowerCase()];
  const year = Number(m[3]);
  if (!Number.isInteger(day) || mon === undefined || !Number.isInteger(year)) {
    return "";
  }

  const dt = new Date(Date.UTC(year, mon, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== mon ||
    dt.getUTCDate() !== day
  ) {
    return "";
  }
  return `${year.toString().padStart(4, "0")}-${(mon + 1).toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function isoToday(): string {
  const dt = new Date();
  const y = dt.getFullYear();
  const m = (dt.getMonth() + 1).toString().padStart(2, "0");
  const d = dt.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function renderDate(value: string): string {
  const iso = toIsoDateInputValue(value);
  if (!iso) return value;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return value;
  return `${d.toString().padStart(2, "0")}/${m.toString().padStart(2, "0")}/${y.toString().padStart(4, "0")}`;
}

// â"€â"€ Inline SVG micro-icons (no sprite dependency) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const IcoChev = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 6l4 4 4-4" />
  </svg>
);
const IcoCheck = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 8.5l3 3 7-7" />
  </svg>
);
const IcoX = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
  >
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);
const IcoDash = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
  >
    <path d="M4 8h8" />
  </svg>
);
const IcoPlus = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
  >
    <path d="M8 3v10M3 8h10" />
  </svg>
);
const IcoUp = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M8 12V4M4 8l4-4 4 4" />
  </svg>
);
const IcoDown = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M8 4v8M4 8l4 4 4-4" />
  </svg>
);
const IcoTrash = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 5h10M6 5V3h4v2M5 5l.5 9h5L11 5" />
  </svg>
);
const IcoLock = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
  >
    <rect x="3.5" y="7" width="9" height="6" rx="1" />
    <path d="M5.5 7V5a2.5 2.5 0 115 0v2" />
  </svg>
);
const IcoCopy = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="5" width="8" height="9" rx="1" />
    <path d="M3 11H2a1 1 0 01-1-1V2a1 1 0 011-1h8a1 1 0 011 1v1" />
  </svg>
);
const IcoDrag = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
    <circle cx="5.5" cy="4" r="1.2"/><circle cx="10.5" cy="4" r="1.2"/>
    <circle cx="5.5" cy="8" r="1.2"/><circle cx="10.5" cy="8" r="1.2"/>
    <circle cx="5.5" cy="12" r="1.2"/><circle cx="10.5" cy="12" r="1.2"/>
  </svg>
);
const IcoDoc = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinejoin="round"
  >
    <path d="M4 2h6l3 3v9H4V2z" />
    <path d="M10 2v3h3M6 8h5M6 11h5" />
  </svg>
);

// â"€â"€ Auto-resize textarea helper â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function fit(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

// â"€â"€ Add Scenario Modal â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function AddScenarioModal({
  moduleId,
  onClose,
}: {
  moduleId: string;
  onClose: () => void;
}) {
  const { addScenario } = useApp();
  const [blid, setBlid] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await addScenario(moduleId, {
      blid: blid.trim(),
      description: desc.trim(),
    });
    setBusy(false);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h3>Add BLID</h3>
        <form onSubmit={submit}>
          <label>
            BLID <span className="label-hint">(from URS)</span>
          </label>
          <input
            autoFocus
            value={blid}
            onChange={(e) => setBlid(e.target.value)}
            placeholder="e.g. 7-1-0-0"
            className="mono-input"
            required
          />
          <label>Description</label>
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="e.g. First-time application submission"
            required
          />
          <div className="modal-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Adding…" : "Add BLID"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// â"€â"€ Copy Step Modal â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function CopyStepModal({ step, onClose }: { step: TestStep; onClose: () => void }) {
  const { state, copyStep } = useApp();
  const { isOwner } = useAuth();
  const [selectedId, setSelectedId] = useState('');
  const [search,     setSearch]     = useState('');
  const [copying,    setCopying]    = useState(false);
  const [done,       setDone]       = useState(false);

  // Only flows the current user owns
  const myFlows = state.flows.filter(f => isOwner(f.created_by));

  const allScenarios = myFlows.flatMap(f =>
    f.modules.flatMap(m =>
      m.scenarios.map(sc => ({ ...sc, moduleLabel: m.label, moduleName: m.name, moduleId: m.id, flowName: f.name, flowId: f.id }))
    )
  );

  const filtered = search.trim()
    ? allScenarios.filter(sc =>
        sc.description.toLowerCase().includes(search.toLowerCase()) ||
        sc.blid.toLowerCase().includes(search.toLowerCase()) ||
        sc.moduleName.toLowerCase().includes(search.toLowerCase()) ||
        sc.flowName.toLowerCase().includes(search.toLowerCase())
      )
    : allScenarios;

  // Group by flow â†' module
  const grouped = myFlows.flatMap(f =>
    f.modules.map(m => ({
      flowName: f.name,
      m,
      scenarios: filtered.filter(sc => sc.moduleId === m.id),
    }))
  ).filter(g => g.scenarios.length > 0);

  const handleCopy = async () => {
    if (!selectedId) return;
    setCopying(true);
    await copyStep(step.id, selectedId);
    setCopying(false);
    setDone(true);
    setTimeout(onClose, 1100);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 500, maxHeight: '78vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <h3>Copy Step to Scenario</h3>

        {done ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--ok)', fontWeight: 600, fontSize: 14 }}>Step copied successfully!</div>
        ) : (
          <>
            <input
              autoFocus
              placeholder="Search scenarios..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 7, fontFamily: 'var(--sans)', fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }}
            />
            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
              {grouped.length === 0 && (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>No scenarios found.</div>
              )}
              {grouped.map(({ flowName, m, scenarios }) => (
                <div key={m.id}>
                  <div style={{ padding: '6px 12px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-3)', background: 'var(--hover)', borderBottom: '1px solid var(--line)' }}>
                    <span style={{ opacity: .6 }}>{flowName} Â· </span>{m.label} Â· {m.name}
                  </div>
                  {scenarios.map(sc => (
                    <button
                      key={sc.id}
                      onClick={() => setSelectedId(sc.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 14px',
                        border: 'none', borderBottom: '1px solid var(--line)', textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--sans)',
                        background: selectedId === sc.id ? 'rgba(29,78,216,.06)' : 'transparent',
                        borderLeft: selectedId === sc.id ? '3px solid var(--blue-2)' : '3px solid transparent',
                      }}
                    >
                      <span className="blid" style={{ flexShrink: 0 }}>{sc.blid}</span>
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>{sc.description}</span>
                      <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)', flexShrink: 0 }}>{sc.steps.length} steps</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div className="modal-actions" style={{ marginTop: 12 }}>
              <button type="button" onClick={onClose}>Cancel</button>
              <button type="button" className="btn-primary" onClick={handleCopy} disabled={!selectedId || copying}>
                {copying ? 'Copyingâ€¦' : 'Copy Step Here'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// â"€â"€ Step Card â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function StepCard({
  step,
  stepNo,
  canEdit,
}: {
  step: TestStep;
  stepNo: number;
  canEdit: boolean;
}) {
  const { updateStep, deleteStep, uploadImage, state, toggleBulk } = useApp();
  const { confirm, modal: confirmModal } = useConfirm();
  const [collapsed,      setCollapsed]      = useState(true);
  const [uploading,      setUploading]      = useState(false);
  const [showCopyModal,  setShowCopyModal]  = useState(false);
  const [evidenceIdx,    setEvidenceIdx]    = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isBulkSelected = state.bulkSelected.has(step.id);
  const upd = (data: Partial<TestStep>) => updateStep(step.id, data);
  const images = parseImages(step.evidence_image);

  const mark = (status: TestStep["status"]) => {
    const d: Partial<TestStep> = { status };
    if ((status === "pass" || status === "fail") && !step.date_tested)
      d.date_tested = isoToday();
    if (status === "untested") {
      d.issue_type = null;
      d.date_tested = "";
    }
    upd(d);
  };

  const uploadFile = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) { alert("Max 10MB"); return; }
    setUploading(true);
    try {
      const url = await uploadImage(file);
      await upd({ evidence_image: serializeImages([...images, url]) });
    } catch {
      alert("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleAddImg = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await uploadFile(file);
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const imageItem = Array.from(e.clipboardData.items).find((item) =>
      item.type.startsWith("image/")
    );
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    e.preventDefault();
    await uploadFile(file);
  };

  const handleRemoveImg = async (idx: number) => {
    const next = images.filter((_, i) => i !== idx);
    await upd({ evidence_image: next.length ? serializeImages(next) : null });
    if (next.length === 0) setEvidenceIdx(null);
    else setEvidenceIdx(i => i !== null ? Math.min(i, next.length - 1) : null);
  };

  return (
    <div
      className={`step-card ${step.status === "pass" ? "step-pass" : step.status === "fail" ? "step-fail" : ""} ${isBulkSelected ? "step-bulk-selected" : ""}`}
    >
      {confirmModal}
      {evidenceIdx !== null && images.length > 0 && (
        <EvidenceModal
          images={images}
          initialIndex={evidenceIdx}
          onClose={() => setEvidenceIdx(null)}
          onDelete={canEdit ? handleRemoveImg : undefined}
          canEdit={canEdit}
        />
      )}

      {/* â"€â"€ Header â"€â"€ */}
      <div
        className="step-hdr"
        style={{ cursor: "pointer" }}
        onClick={() => setCollapsed((c) => !c)}
      >
        <input
          type="checkbox"
          className="step-bulk-cb"
          checked={isBulkSelected}
          onClick={e => e.stopPropagation()}
          onChange={() => toggleBulk(step.id)}
          title="Select for bulk action"
        />
        <svg
          style={{
            width: 12,
            height: 12,
            flexShrink: 0,
            transition: "transform .2s",
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
          }}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
        <span className="step-num">Step {stepNo}</span>
        <input
          className="step-desc-inp"
          defaultValue={step.description}
          placeholder="Step description..."
          readOnly={!canEdit}
          onClick={(e) => e.stopPropagation()}
          onBlur={
            canEdit
              ? (e) => {
                  if (e.target.value.trim() !== step.description)
                    upd({ description: e.target.value.trim() });
                }
              : undefined
          }
        />
        <button
          className="btn-xs"
          title="Copy step to another scenario"
          onClick={(e) => { e.stopPropagation(); setShowCopyModal(true); }}
        >
          <IcoCopy />
        </button>
        {canEdit && (
          <button
            className="btn-xs btn-danger"
            title="Delete step"
            onClick={async (e) => {
              e.stopPropagation();
              if (await confirm({ message: "Delete this step?" }))
                deleteStep(step.id);
            }}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        )}
      </div>
      {showCopyModal && <CopyStepModal step={step} onClose={() => setShowCopyModal(false)} />}

      {/* â"€â"€ Body â"€â"€ */}
      {!collapsed && (
        <div className="step-body" onPaste={canEdit ? handlePaste : undefined}>
          {/* Expected result */}
          <div className="step-section">
            <span className="step-section-label">Expected Result</span>
            <textarea
              className="step-textarea"
              ref={fit}
              rows={2}
              defaultValue={step.expected}
              placeholder="Describe what should happen..."
              readOnly={!canEdit}
              onInput={(e) => fit(e.currentTarget)}
              onBlur={
                canEdit ? (e) => upd({ expected: e.target.value }) : undefined
              }
            />
          </div>

          {/* Status + Issue type */}
          <div className="step-section">
            <span className="step-section-label">Test Result</span>
            <div className="step-status-row">
              {canEdit ? (
                <>
                  <button
                    className={`ep-st-btn ${step.status === "pass" ? "ep-pass" : ""}`}
                    onClick={() => mark("pass")}
                  >
                    Pass
                  </button>
                  <button
                    className={`ep-st-btn ${step.status === "fail" ? "ep-fail" : ""}`}
                    onClick={() => mark("fail")}
                  >
                    Fail
                  </button>
                  <button
                    className={`ep-st-btn ${step.status === "untested" ? "ep-nt" : ""}`}
                    onClick={() => mark("untested")}
                  >
                    Reset
                  </button>
                </>
              ) : (
                <span
                  className={`sst-pill ${step.status === "pass" ? "sst-pill-pass" : step.status === "fail" ? "sst-pill-fail" : "sst-pill-nt"}`}
                >
                  {step.status === "pass"
                    ? "PASS"
                    : step.status === "fail"
                      ? "FAIL"
                      : "N/T"}
                </span>
              )}
              {step.status === "fail" &&
                (() => {
                  const needsIssue = !step.issue_type;
                  return (
                    <div
                      className={`step-issue-row ${needsIssue ? "step-issue-row--required" : ""}`}
                    >
                      {needsIssue && (
                        <span className="step-issue-required">
                          Issue type required!
                        </span>
                      )}
                      <button
                        className={`ep-issue-btn ep-blocker ${step.issue_type === "blocker" ? "on" : ""}`}
                        onClick={() =>
                          canEdit &&
                          upd({
                            issue_type:
                              step.issue_type === "blocker" ? null : "blocker",
                          })
                        }
                      >
                        Blocker
                      </button>
                      <button
                        className={`ep-issue-btn ep-major ${step.issue_type === "major" ? "on" : ""}`}
                        onClick={() =>
                          canEdit &&
                          upd({
                            issue_type:
                              step.issue_type === "major" ? null : "major",
                          })
                        }
                      >
                        Major
                      </button>
                      <button
                        className={`ep-issue-btn ep-minor ${step.issue_type === "minor" ? "on" : ""}`}
                        onClick={() =>
                          canEdit &&
                          upd({
                            issue_type:
                              step.issue_type === "minor" ? null : "minor",
                          })
                        }
                      >
                        Minor
                      </button>
                    </div>
                  );
                })()}
            </div>
          </div>

          {/* Evidence â€" only when tested */}
          {step.status !== "untested" && (
            <>
              {/* Meta fields */}
              <div className="step-section">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  {!step.date_tested && (
                    <span className="step-hint step-hint-warn">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      Date not set
                    </span>
                  )}
                  {step.status === 'fail' && !step.ado_ticket && (
                    <span className="step-hint step-hint-info">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      ADO ticket recommended for failures
                    </span>
                  )}
                </div>
                <div className="step-meta-row">
                  <label className="step-meta-field">
                    <span className="step-meta-label">Date Tested</span>
                    <input
                      className={`step-meta-inp step-meta-date ${!step.date_tested ? 'step-meta-inp--warn' : ''}`}
                      type="date"
                      defaultValue={toIsoDateInputValue(step.date_tested)}
                      placeholder="Date tested"
                      readOnly={!canEdit}
                      onBlur={
                        canEdit
                          ? (e) => upd({ date_tested: e.target.value })
                          : undefined
                      }
                    />
                  </label>
                  <label className="step-meta-field">
                    <span className="step-meta-label">ADO Ticket</span>
                    <input
                      className={`step-meta-inp ${step.status === 'fail' && !step.ado_ticket ? 'step-meta-inp--info' : ''}`}
                      defaultValue={step.ado_ticket}
                      placeholder="ADO ticket #"
                      readOnly={!canEdit}
                      onBlur={
                        canEdit
                          ? (e) => upd({ ado_ticket: e.target.value })
                          : undefined
                      }
                    />
                  </label>
                  <label className="step-meta-field step-meta-url-field">
                    <span className="step-meta-label">Evidence URL</span>
                    <input
                      className="step-meta-inp step-meta-url"
                      defaultValue={step.evidence_url}
                      placeholder="Evidence URL"
                      readOnly={!canEdit}
                      type="url"
                      onBlur={
                        canEdit
                          ? (e) => upd({ evidence_url: e.target.value })
                          : undefined
                      }
                    />
                  </label>
                </div>
              </div>

              {/* Remarks */}
              <div className="step-section">
                <span className="step-section-label">Remarks / Actual Result</span>
                <textarea
                  className="step-textarea"
                  ref={fit}
                  rows={2}
                  defaultValue={step.remarks}
                  placeholder="Describe the actual outcome..."
                  readOnly={!canEdit}
                  onInput={(e) => fit(e.currentTarget)}
                  onBlur={
                    canEdit
                      ? (e) => upd({ remarks: e.target.value })
                      : undefined
                  }
                />
              </div>

              {/* Screenshots */}
              <div className="step-section">
                <span className="step-section-label">Screenshots</span>
                <div className="step-photos">
                  {images.map((url, idx) => (
                    <div key={idx} className="step-photo-thumb">
                      <img
                        src={url}
                        alt={`screenshot ${idx + 1}`}
                        onClick={() => setEvidenceIdx(idx)}
                        style={{ cursor: 'zoom-in' }}
                      />
                      {canEdit && (
                        <button
                          className="step-photo-del"
                          title="Remove screenshot"
                          onClick={() => handleRemoveImg(idx)}
                        >
                          <svg
                            width="9"
                            height="9"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          >
                            <path d="M4 4l8 8M12 4l-8 8" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                  {canEdit && (
                    <>
                      <label
                        className={`step-photo-add ${uploading ? "step-photo-add--loading" : ""}`}
                        title={uploading ? "Uploading…" : "Browse image file"}
                      >
                        <span>{uploading ? "â€¦" : "+"}</span>
                        <input
                          ref={fileRef}
                          type="file"
                          accept="image/*"
                          onChange={handleAddImg}
                          style={{ display: "none" }}
                        />
                      </label>
                      <div
                        className={`step-paste-zone ${uploading ? "step-paste-zone--loading" : ""}`}
                        tabIndex={0}
                        onMouseEnter={(e) => e.currentTarget.focus()}
                        onPaste={handlePaste}
                        title={uploading ? "Uploading…" : "Paste image (Ctrl+V)"}
                        aria-label={uploading ? "Uploading image" : "Paste image from clipboard"}
                      >
                        {uploading ? (
                          "…"
                        ) : (
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <rect x="5" y="5" width="8" height="9" rx="1" />
                            <path d="M3 11H2a1 1 0 01-1-1V2a1 1 0 011-1h8a1 1 0 011 1v1" />
                          </svg>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// â"€â"€ Bulk Action Bar â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function BulkActionBar() {
  const { state, clearBulk, bulkUpdateSteps } = useApp();
  const count = state.bulkSelected.size;
  if (count === 0) return null;

  const ids = [...state.bulkSelected];
  const isoToday_ = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

  const bulk = async (data: Partial<TestStep>) => { await bulkUpdateSteps(ids, data); clearBulk(); };

  return (
    <div className="bulk-bar">
      <span className="bulk-count">{count} step{count !== 1 ? 's' : ''} selected</span>
      <div className="bulk-actions">
        <button className="bulk-btn bulk-pass" onClick={() => bulk({ status: 'pass', date_tested: isoToday_() })}>
          ✓ Mark Pass
        </button>
        <button className="bulk-btn bulk-fail" onClick={() => bulk({ status: 'fail', date_tested: isoToday_() })}>
          ✗ Mark Fail
        </button>
        <button className="bulk-btn bulk-reset" onClick={() => bulk({ status: 'untested', issue_type: null, date_tested: '' })}>
          Reset
        </button>
        <button className="bulk-btn bulk-date" onClick={() => {
          const d = prompt('Set date (YYYY-MM-DD):', isoToday_());
          if (d) bulk({ date_tested: d });
        }}>
          📅 Set Date
        </button>
        <button className="bulk-btn bulk-ado" onClick={() => {
          const t = prompt('Set ADO ticket number:');
          if (t !== null) bulk({ ado_ticket: t });
        }}>
          🎫 Set ADO
        </button>
      </div>
      <button className="bulk-cancel" onClick={clearBulk} title="Clear selection">✕</button>
    </div>
  );
}

// â"€â"€ Expand Panel (step list) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function ExpandPanel({ sc, canEdit }: { sc: Scenario; canEdit: boolean }) {
  const { addStep, deleteScenario, moveStep } = useApp();
  const { confirm, modal: confirmModal } = useConfirm();
  const [showAdd,      setShowAdd]      = useState(false);
  const [stepDesc,     setStepDesc]     = useState("");
  const [stepExp,      setStepExp]      = useState("");
  const [adding,       setAdding]       = useState(false);
  const [dragFromIdx,  setDragFromIdx]  = useState<number | null>(null);
  const [dragOverIdx,  setDragOverIdx]  = useState<number | null>(null);

  const handleAddStep = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    await addStep(sc.id, {
      description: stepDesc.trim(),
      expected: stepExp.trim(),
    });
    setStepDesc("");
    setStepExp("");
    setShowAdd(false);
    setAdding(false);
  };

  return (
    <div className="expand-panel">
      {confirmModal}
      {sc.steps.length === 0 && !showAdd && (
        <div className="sc-empty">
          <div className="sc-empty-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </div>
          <span className="sc-empty-text">No steps yet</span>
          {canEdit && (
            <button className="sc-empty-btn" onClick={() => setShowAdd(true)}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add first step
            </button>
          )}
        </div>
      )}

      {sc.steps.map((step, i) => (
        <div
          key={step.id}
          draggable={canEdit}
          onDragStart={() => setDragFromIdx(i)}
          onDragOver={e => { e.preventDefault(); setDragOverIdx(i); }}
          onDragEnd={() => { setDragFromIdx(null); setDragOverIdx(null); }}
          onDrop={async () => {
            const from = dragFromIdx;
            const to   = i;
            setDragFromIdx(null);
            setDragOverIdx(null);
            if (from === null || from === to) return;
            const ok = await confirm({
              message: `Move "Step ${from + 1}" to position ${to + 1}?`,
              confirmLabel: 'Move',
              danger: false,
            });
            if (ok) await moveStep(sc.id, sc.steps[from].id, to);
          }}
          style={{
            outline: dragOverIdx === i && dragFromIdx !== null && dragFromIdx !== i
              ? '2px dashed var(--blue-2)'
              : 'none',
            borderRadius: 8,
          }}
        >
          {canEdit && (
            <div style={{ padding: '3px 10px 0', cursor: 'grab', userSelect: 'none' }} title="Drag to reorder" />
          )}
          <StepCard step={step} stepNo={i + 1} canEdit={canEdit} />
        </div>
      ))}

      {canEdit &&
        (showAdd ? (
          <form className="add-step-form" onSubmit={handleAddStep}>
            <input
              autoFocus
              value={stepDesc}
              onChange={(e) => setStepDesc(e.target.value)}
              placeholder="Step description *"
              required
            />
            <textarea
              ref={fit}
              value={stepExp}
              onChange={(e) => {
                setStepExp(e.target.value);
                fit(e.target);
              }}
              placeholder="Expected result *"
              rows={2}
              required
            />
            <div className="add-step-btns">
              <button
                type="button"
                onClick={() => {
                  setShowAdd(false);
                  setStepDesc("");
                  setStepExp("");
                }}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={adding}>
                {adding ? "Addingâ€¦" : "Add Step"}
              </button>
            </div>
          </form>
        ) : (
          sc.steps.length > 0 && (
            <button
              className="btn-xs"
              style={{ marginTop: 8 }}
              onClick={() => setShowAdd(true)}
            >
              + Add Step
            </button>
          )
        ))}

      {canEdit && (
        <div
          className="ep-footer"
          style={{
            marginTop: 12,
            borderTop: "1px solid var(--line)",
            paddingTop: 10,
          }}
        >
          <button
            className="btn-del-sc"
            onClick={async () => {
              if (
                await confirm({
                  message: "Delete this scenario and all its steps?",
                })
              )
                deleteScenario(sc.id);
            }}
          >
            Delete Scenario
          </button>
        </div>
      )}
    </div>
  );
}

// â"€â"€ Scenario Row â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function ScenarioRow({
  sc, canEdit, isDragOver,
  onDragStart, onDragOver, onDrop, onDragEnd,
}: {
  sc: Scenario; canEdit: boolean; isDragOver: boolean;
  onDragStart: () => void; onDragOver: () => void;
  onDrop: () => void; onDragEnd: () => void;
}) {
  const { state, toggleExpand } = useApp();
  const isExp = state.expanded.has(sc.id);

  // Derive status: only a blocker step makes the scenario 'fail'
  const derived = scenarioStatus(sc);

  // Derive worst issue type from failed steps
  const issue = scenarioIssueType(sc);

  // Last tested step for date; any step with a ticket for ADO
  const testedStep = [...sc.steps]
    .reverse()
    .find((s) => s.status !== "untested");
  const metaDate = renderDate(testedStep?.date_tested || "");
  const metaAdos = [...new Set(sc.steps.map((s) => s.ado_ticket).filter(Boolean))] as string[];

  return (
    <>
      <tr
        className={`sc-row ${derived === "pass" ? "row-pass" : derived === "fail" ? "row-fail" : ""} ${isDragOver ? "sc-row-drag-over" : ""}`}
        draggable={canEdit}
        onDragStart={onDragStart}
        onDragOver={e => { e.preventDefault(); onDragOver(); }}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
      >
        {/* Drag handle */}
        <td style={{ width: 24, cursor: canEdit ? 'grab' : 'default' }} title={canEdit ? 'Drag to reorder' : ''} />

        {/* BLID */}
        <td>
          <span className="blid">{sc.blid}</span>
        </td>

        {/* Description + issue badge + step counts */}
        <td>
          <div className="sc-desc">
            {sc.description}
            {issue && (
              <span className={`sc-issue ${issue}`}>
                {issue.toUpperCase()}
              </span>
            )}
          </div>
          {sc.steps.length > 0 && (
            <div className="step-count-badge">
              {sc.steps.filter((s) => s.status === "pass").length > 0 && (
                <span style={{ color: "var(--ok)" }}>
                  {sc.steps.filter((s) => s.status === "pass").length} pass
                </span>
              )}
              {sc.steps.filter((s) => s.status === "fail").length > 0 && (
                <span style={{ color: "var(--bad)" }}>
                  {" "}
                  {sc.steps.filter((s) => s.status === "fail").length} fail
                </span>
              )}{" "}
              {sc.steps.length} step{sc.steps.length !== 1 ? "s" : ""}
            </div>
          )}
        </td>

        {/* Derived status pill */}
        <td style={{ textAlign: "center" }}>
          {derived === "pass" && (
            <span className="sst-pill sst-pill-pass">
              <IcoCheck /> PASS
            </span>
          )}
          {derived === "fail" && (
            <span className="sst-pill sst-pill-fail">
              <IcoX /> FAIL
            </span>
          )}
          {derived === "untested" && (
            <span className="sst-pill sst-pill-nt">
              <IcoDash /> N/T
            </span>
          )}
        </td>

        {/* Date tested */}
        <td>
          {metaDate ? (
            <span className="sc-meta-date">{metaDate}</span>
          ) : (
            <span className="sc-meta-none">-</span>
          )}
        </td>

        {/* ADO ticket(s) */}
        <td>
          {metaAdos.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {metaAdos.map((ado) => (
                <span key={ado} className="sc-meta-ado">
                  {ado.startsWith("http") ? "Link" : ado}
                </span>
              ))}
            </div>
          ) : (
            <span className="sc-meta-none">-</span>
          )}
        </td>

        {/* Expand chevron */}
        <td style={{ textAlign: "center" }}>
          <button
            className={`sc-chev-btn ${isExp ? "open" : ""}`}
            onClick={() => toggleExpand(sc.id)}
          >
            <IcoChev />
          </button>
        </td>
      </tr>

      {isExp && (
        <tr className="exp-row">
          <td colSpan={7}>
            <ExpandPanel sc={sc} canEdit={canEdit} />
          </td>
        </tr>
      )}
    </>
  );
}

// â"€â"€ Module Card â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function ModuleCard({ mod, flow }: { mod: Module; flow: Flow }) {
  const { deleteModule, moveModule, moveScenario } = useApp();
  const { isOwner } = useAuth();
  const { confirm, modal: confirmModal } = useConfirm();
  const [showAdd,      setShowAdd]      = useState(false);
  const [collapsed,    setCollapsed]    = useState(false);
  const [dragFromIdx,  setDragFromIdx]  = useState<number | null>(null);
  const [dragOverIdx,  setDragOverIdx]  = useState<number | null>(null);

  const canEdit = isOwner(flow.created_by);
  const st = modStatus(mod);
  const sm = STATUS_META[st];
  const ms = modStats(mod);
  const modIdxInFlow = flow.modules.findIndex(m => m.id === mod.id);
  const gated = modIdxInFlow >= 0 && isGated(flow, modIdxInFlow);

  // Border colour per status
  const borderC: Record<string, string> = {
    complete: "#059669",
    blocked: "#dc2626",
    major: "#d97706",
    minor: "#d97706",
    progress: "#3b82f6",
    pending: "#e2e8f0",
    empty: "#e2e8f0",
  };

  // Progress bar widths
  const total = ms.total || 1;
  const passPct = Math.round((ms.pass / total) * 100);
  const failPct = Math.round((ms.fail / total) * 100);
  const ntPct = 100 - passPct - failPct;

  // eDS â†' blue, HITS â†' purple
  const sideC = mod.side === "eDS" ? "#1d4ed8" : "#7c3aed";
  const sideBg =
    mod.side === "eDS" ? "rgba(29,78,216,.1)" : "rgba(124,58,237,.1)";
  const sideBd =
    mod.side === "eDS" ? "rgba(29,78,216,.3)" : "rgba(124,58,237,.3)";

  return (
    <>
      {confirmModal}
      <div
        id={`mod-${mod.id}`}
        className={`mod-section ${collapsed ? "mod-collapsed" : ""}`}
        style={{ borderLeftColor: borderC[st] ?? "#e2e8f0" }}
      >
        {/* â"€â"€ Header (click to collapse) â"€â"€ */}
        <div
          className="mod-header"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("button")) return;
            setCollapsed((c) => !c);
          }}
          style={{ cursor: "pointer" }}
        >
          {/* Left: chevron + badge + title */}
          <div className="mod-hdr-left" style={{ gap: 10 }}>
            <span className="mod-chev">
              <IcoChev />
            </span>

            <span
              className="mod-badge"
              style={{ background: sideBg, color: sideC, borderColor: sideBd }}
            >
              {mod.label}
            </span>

            <div>
              <div className="mod-name">
                {mod.name}
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: sideC,
                    marginLeft: 7,
                    textTransform: "uppercase",
                    letterSpacing: ".06em",
                    opacity: 0.8,
                  }}
                >
                  {mod.side}
                </span>
              </div>
              {mod.note && <div className="mod-side">{mod.note}</div>}
            </div>
          </div>

          {/* Right: progress + mini counts + status + actions */}
          <div className="mod-hdr-right" style={{ gap: 10 }}>
            {/* Progress bar */}
            {ms.total > 0 && (
              <div className="mod-prog">
                <div className="mod-prog-bar">
                  <div className="mpb-pass" style={{ width: `${passPct}%` }} />
                  <div className="mpb-fail" style={{ width: `${failPct}%` }} />
                  <div className="mpb-nt" style={{ width: `${ntPct}%` }} />
                </div>
                <div className="mod-prog-pct">{passPct}%</div>
              </div>
            )}

            {/* Mini counts */}
            <div className="mini-ct">
              <div className="mct mct-p" title="Pass">
                <span className="mct-dot" />
                {ms.pass}
              </div>
              <div className="mct mct-f" title="Fail">
                <span className="mct-dot" />
                {ms.fail}
              </div>
              <div className="mct mct-u" title="Untested">
                <span className="mct-dot" />
                {ms.untested}
              </div>
            </div>

            {/* Status badge */}
            <span className={`st-badge ${sm.cls}`}>{sm.label === "No Scenarios" ? "No BLIDs" : sm.label}</span>

            {/* Action buttons â€" owner only */}
            {canEdit && (
              <>
                <button className="sc-add-btn" onClick={() => setShowAdd(true)}>
                  <IcoPlus />
                  BLID
                </button>
                <button
                  className="mod-ico-btn"
                  title="Move up"
                  onClick={async () => {
                    const idx = modIdxInFlow;
                    if (idx <= 0) return;
                    if (await confirm({ message: `Move "${mod.name}" above "${flow.modules[idx - 1].name}"?`, confirmLabel: 'Move', danger: false }))
                      moveModule(flow.id, mod.id, -1);
                  }}
                >
                  <IcoUp />
                </button>
                <button
                  className="mod-ico-btn"
                  title="Move down"
                  onClick={async () => {
                    const idx = modIdxInFlow;
                    if (idx < 0 || idx >= flow.modules.length - 1) return;
                    if (await confirm({ message: `Move "${mod.name}" below "${flow.modules[idx + 1].name}"?`, confirmLabel: 'Move', danger: false }))
                      moveModule(flow.id, mod.id, 1);
                  }}
                >
                  <IcoDown />
                </button>
                <button
                  className="mod-ico-btn ico-danger"
                  title="Delete module"
                  onClick={async () => {
                    if (
                      await confirm({
                        message: "Delete module and all its scenarios?",
                      })
                    )
                      deleteModule(mod.id);
                  }}
                >
                  <IcoTrash />
                </button>
              </>
            )}
          </div>
        </div>

        {/* â"€â"€ Gated banner â"€â"€ */}
        {gated && (
          <div className="gate-banner-v2">
            <IcoLock />
            <span>
              <strong>Gated</strong> - a previous module has a Blocker issue.
              Resolve it before testing here.
            </span>
          </div>
        )}

        {/* â"€â"€ Scenarios table or empty state â"€â"€ */}
        {mod.scenarios.length === 0 ? (
          <div className="mod-empty">
            <div className="mod-empty-ico">
              <IcoDoc />
            </div>
            <div className="mod-empty-title">No BLIDs yet</div>
            <div className="mod-empty-sub">
              {canEdit
                ? "Add BLIDs from the URS document to begin tracking this module."
                : "No BLIDs have been added to this module yet."}
            </div>
            {canEdit && (
              <button
                className="sc-add-btn"
                style={{ margin: "0 auto", display: "inline-flex" }}
                onClick={() => setShowAdd(true)}
              >
                <IcoPlus />
                Add BLID
              </button>
            )}
          </div>
        ) : (
          <table className="sc-table">
            <thead className="sc-thead-sticky">
              <tr>
                <th style={{ width: 24 }} />
                <th style={{ width: 90 }}>BLID</th>
                <th>Description</th>
                <th style={{ width: 85, textAlign: "center" }}>Status</th>
                <th style={{ width: 115 }}>Date Tested</th>
                <th style={{ width: 120 }}>ADO Ticket</th>
                <th style={{ width: 38 }} />
              </tr>
            </thead>
            <tbody>
              {mod.scenarios.map((sc, idx) => (
                <ScenarioRow
                  key={sc.id}
                  sc={sc}
                  canEdit={canEdit}
                  isDragOver={dragOverIdx === idx && dragFromIdx !== null && dragFromIdx !== idx}
                  onDragStart={() => setDragFromIdx(idx)}
                  onDragOver={() => setDragOverIdx(idx)}
                  onDragEnd={() => { setDragFromIdx(null); setDragOverIdx(null); }}
                  onDrop={async () => {
                    const from = dragFromIdx;
                    const to   = idx;
                    setDragFromIdx(null);
                    setDragOverIdx(null);
                    if (from === null || from === to) return;
                    const sc = mod.scenarios[from];
                    const ok = await confirm({
                      message: `Move "${sc.description}" from position ${from + 1} to position ${to + 1}?`,
                      confirmLabel: 'Move',
                      danger: false,
                    });
                    if (ok) await moveScenario(mod.id, sc.id, to);
                  }}
                />
              ))}
            </tbody>
          </table>
        )}

        {showAdd && (
          <AddScenarioModal
            moduleId={mod.id}
            onClose={() => setShowAdd(false)}
          />
        )}
      </div>
    </>
  );
}

// â"€â"€ ScenariosView â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
export function ScenariosView() {
  const { activeFlow, state, setHighlightModule } = useApp();

  useEffect(() => {
    const id = state.highlightModuleId;
    if (!id) return;
    const el = document.getElementById(`mod-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('mod-highlight');
      const t = setTimeout(() => { el.classList.remove('mod-highlight'); setHighlightModule(null); }, 2000);
      return () => clearTimeout(t);
    }
  }, [state.highlightModuleId]);
  if (!activeFlow) return null;

  const q = state.searchQuery.toLowerCase().trim();
  const filteredMods = !q
    ? activeFlow.modules
    : activeFlow.modules
        .map(mod => {
          if (
            mod.name.toLowerCase().includes(q) ||
            mod.label.toLowerCase().includes(q) ||
            mod.note?.toLowerCase().includes(q)
          ) return mod;
          const filteredScenarios = mod.scenarios.filter(sc =>
            sc.blid.toLowerCase().includes(q) ||
            sc.description.toLowerCase().includes(q) ||
            sc.steps.some(s =>
              s.description.toLowerCase().includes(q) ||
              s.expected?.toLowerCase().includes(q) ||
              s.ado_ticket?.toLowerCase().includes(q) ||
              s.remarks?.toLowerCase().includes(q)
            )
          );
          if (!filteredScenarios.length) return null;
          return { ...mod, scenarios: filteredScenarios };
        })
        .filter(Boolean) as typeof activeFlow.modules;

  if (!activeFlow.modules.length) {
    return (
      <div className="empty-state">
        <div className="es-icon">📋</div>
        <div className="es-title">No modules yet</div>
        <div className="es-sub">Add modules using the button in the header</div>
      </div>
    );
  }

  if (q && !filteredMods.length) {
    return (
      <div className="empty-state">
        <div className="es-icon">🔍</div>
        <div className="es-title">No results for "{state.searchQuery}"</div>
        <div className="es-sub">Try a different module name, BLID, or step description</div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <BulkActionBar />
      {filteredMods.map((mod) => (
        <ModuleCard key={mod.id} mod={mod} flow={activeFlow} />
      ))}
    </div>
  );
}
