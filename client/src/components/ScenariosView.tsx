import { useState, useRef } from "react";
import { useApp } from "../AppContext";
import { useAuth } from "../AuthContext";
import {
  modStatus,
  modStats,
  isGated,
  STATUS_META,
  today,
  scenarioStatus,
  scenarioIssueType,
} from "../utils";
import { useConfirm } from "./ConfirmModal";
import type { Flow, Module, Scenario, TestStep } from "../types";

// ── Image helpers (multi-screenshot support) ──────────────────────────────────
import { parseImages, serializeImages } from "./diagnosticsHelpers";

// ── Inline SVG micro-icons (no sprite dependency) ─────────────────────────────
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

// ── Auto-resize textarea helper ───────────────────────────────────────────────
function fit(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

// ── Add Scenario Modal ────────────────────────────────────────────────────────
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
        <h3>Add Scenario</h3>
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
          <label>Scenario description</label>
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
              {busy ? "Adding…" : "Add Scenario"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Step Card ─────────────────────────────────────────────────────────────────
function StepCard({
  step,
  stepNo,
  canEdit,
}: {
  step: TestStep;
  stepNo: number;
  canEdit: boolean;
}) {
  const { updateStep, deleteStep, uploadImage } = useApp();
  const { confirm, modal: confirmModal } = useConfirm();
  const [collapsed, setCollapsed] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const upd = (data: Partial<TestStep>) => updateStep(step.id, data);
  const images = parseImages(step.evidence_image);

  const mark = (status: TestStep["status"]) => {
    const d: Partial<TestStep> = { status };
    if ((status === "pass" || status === "fail") && !step.date_tested)
      d.date_tested = today();
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
  };

  return (
    <div
      className={`step-card ${step.status === "pass" ? "step-pass" : step.status === "fail" ? "step-fail" : ""}`}
    >
      {confirmModal}

      {/* ── Header ── */}
      <div
        className="step-hdr"
        style={{ cursor: "pointer" }}
        onClick={() => setCollapsed((c) => !c)}
      >
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
          placeholder="Step description…"
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
        {canEdit && (
          <button
            className="btn-xs btn-danger"
            onClick={async (e) => {
              e.stopPropagation();
              if (await confirm({ message: "Delete this step?" }))
                deleteStep(step.id);
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* ── Body ── */}
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
              placeholder="Describe what should happen…"
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
                    ✓ Pass
                  </button>
                  <button
                    className={`ep-st-btn ${step.status === "fail" ? "ep-fail" : ""}`}
                    onClick={() => mark("fail")}
                  >
                    ✗ Fail
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
                    ? "✓ PASS"
                    : step.status === "fail"
                      ? "✗ FAIL"
                      : "— N/T"}
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

          {/* Evidence — only when tested */}
          {step.status !== "untested" && (
            <>
              {/* Meta fields */}
              <div className="step-section">
                <span className="step-section-label">Evidence Details</span>
                <div className="step-meta-row">
                  <input
                    className="step-meta-inp"
                    defaultValue={step.date_tested}
                    placeholder="Date tested"
                    readOnly={!canEdit}
                    onBlur={
                      canEdit
                        ? (e) => upd({ date_tested: e.target.value })
                        : undefined
                    }
                  />
                  <input
                    className="step-meta-inp"
                    defaultValue={step.ado_ticket}
                    placeholder="ADO ticket #"
                    readOnly={!canEdit}
                    onBlur={
                      canEdit
                        ? (e) => upd({ ado_ticket: e.target.value })
                        : undefined
                    }
                  />
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
                  placeholder="Describe the actual outcome…"
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
                        onClick={() => window.open(url)}
                      />
                      {canEdit && (
                        <button
                          className="step-photo-del"
                          onClick={() => handleRemoveImg(idx)}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  {canEdit && (
                    <>
                      <label
                        className={`step-photo-add ${uploading ? "step-photo-add--loading" : ""}`}
                        title={uploading ? "Uploading…" : "Browse file"}
                      >
                        <span>{uploading ? "…" : "+"}</span>
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
                        onPaste={handlePaste}
                        title="Click here then Ctrl+V to paste an image"
                      >
                        {uploading ? "Uploading…" : "Ctrl+V to paste"}
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

// ── Expand Panel (step list) ──────────────────────────────────────────────────
function ExpandPanel({ sc, canEdit }: { sc: Scenario; canEdit: boolean }) {
  const { addStep, deleteScenario } = useApp();
  const { confirm, modal: confirmModal } = useConfirm();
  const [showAdd, setShowAdd] = useState(false);
  const [stepDesc, setStepDesc] = useState("");
  const [stepExp, setStepExp] = useState("");
  const [adding, setAdding] = useState(false);

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
          {canEdit ? (
            <>
              No steps yet —{" "}
              <button className="link-btn" onClick={() => setShowAdd(true)}>
                add first step
              </button>
            </>
          ) : (
            "No steps yet."
          )}
        </div>
      )}

      {sc.steps.map((step, i) => (
        <StepCard key={step.id} step={step} stepNo={i + 1} canEdit={canEdit} />
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
                {adding ? "Adding…" : "Add Step"}
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

// ── Scenario Row ──────────────────────────────────────────────────────────────
function ScenarioRow({ sc, canEdit }: { sc: Scenario; canEdit: boolean }) {
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
  const metaDate = testedStep?.date_tested || "";
  const metaAdos = [...new Set(sc.steps.map((s) => s.ado_ticket).filter(Boolean))] as string[];

  return (
    <>
      <tr
        className={`sc-row ${derived === "pass" ? "row-pass" : derived === "fail" ? "row-fail" : ""}`}
      >
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
                  {sc.steps.filter((s) => s.status === "pass").length}✓
                </span>
              )}
              {sc.steps.filter((s) => s.status === "fail").length > 0 && (
                <span style={{ color: "var(--bad)" }}>
                  {" "}
                  {sc.steps.filter((s) => s.status === "fail").length}✗
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
            <span className="sc-meta-none">—</span>
          )}
        </td>

        {/* ADO ticket(s) */}
        <td>
          {metaAdos.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {metaAdos.map((ado) => (
                <span key={ado} className="sc-meta-ado">
                  {ado.startsWith("http") ? "🔗 link" : ado}
                </span>
              ))}
            </div>
          ) : (
            <span className="sc-meta-none">—</span>
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
          <td colSpan={6}>
            <ExpandPanel sc={sc} canEdit={canEdit} />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Module Card ───────────────────────────────────────────────────────────────
function ModuleCard({ mod, flow }: { mod: Module; flow: Flow }) {
  const { deleteModule, moveModule } = useApp();
  const { isOwner } = useAuth();
  const { confirm, modal: confirmModal } = useConfirm();
  const [showAdd, setShowAdd] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const canEdit = isOwner(flow.created_by);
  const st = modStatus(mod);
  const sm = STATUS_META[st];
  const ms = modStats(mod);
  const gated = isGated(flow, flow.modules.indexOf(mod));

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

  // eDS → blue, HITS → purple
  const sideC = mod.side === "eDS" ? "#1d4ed8" : "#7c3aed";
  const sideBg =
    mod.side === "eDS" ? "rgba(29,78,216,.1)" : "rgba(124,58,237,.1)";
  const sideBd =
    mod.side === "eDS" ? "rgba(29,78,216,.3)" : "rgba(124,58,237,.3)";

  return (
    <>
      {confirmModal}
      <div
        className={`mod-section ${collapsed ? "mod-collapsed" : ""}`}
        style={{ borderLeftColor: borderC[st] ?? "#e2e8f0" }}
      >
        {/* ── Header (click to collapse) ── */}
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
              <div className="mct mct-p">
                <span className="mct-dot" />
                {ms.pass}
              </div>
              <div className="mct mct-f">
                <span className="mct-dot" />
                {ms.fail}
              </div>
              <div className="mct mct-u">
                <span className="mct-dot" />
                {ms.untested}
              </div>
            </div>

            {/* Status badge */}
            <span className={`st-badge ${sm.cls}`}>{sm.label}</span>

            {/* Action buttons — owner only */}
            {canEdit && (
              <>
                <button className="sc-add-btn" onClick={() => setShowAdd(true)}>
                  <IcoPlus />
                  Scenario
                </button>
                <button
                  className="mod-ico-btn"
                  onClick={() => moveModule(flow.id, mod.id, -1)}
                  title="Move up"
                >
                  <IcoUp />
                </button>
                <button
                  className="mod-ico-btn"
                  onClick={() => moveModule(flow.id, mod.id, 1)}
                  title="Move down"
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

        {/* ── Gated banner ── */}
        {gated && (
          <div className="gate-banner-v2">
            <IcoLock />
            <span>
              <strong>Gated</strong> — a previous module has a Blocker issue.
              Resolve it before testing here.
            </span>
          </div>
        )}

        {/* ── Scenarios table or empty state ── */}
        {mod.scenarios.length === 0 ? (
          <div className="mod-empty">
            <div className="mod-empty-ico">
              <IcoDoc />
            </div>
            <div className="mod-empty-title">No scenarios yet</div>
            <div className="mod-empty-sub">
              {canEdit
                ? "Add scenarios from the URS document to begin tracking this module."
                : "No scenarios have been added to this module yet."}
            </div>
            {canEdit && (
              <button
                className="sc-add-btn"
                style={{ margin: "0 auto", display: "inline-flex" }}
                onClick={() => setShowAdd(true)}
              >
                <IcoPlus />
                Add first scenario
              </button>
            )}
          </div>
        ) : (
          <table className="sc-table">
            <thead>
              <tr>
                <th style={{ width: 90 }}>BLID</th>
                <th>Scenario</th>
                <th style={{ width: 85, textAlign: "center" }}>Status</th>
                <th style={{ width: 115 }}>Date Tested</th>
                <th style={{ width: 120 }}>ADO Ticket</th>
                <th style={{ width: 38 }} />
              </tr>
            </thead>
            <tbody>
              {mod.scenarios.map((sc) => (
                <ScenarioRow key={sc.id} sc={sc} canEdit={canEdit} />
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

// ── ScenariosView ─────────────────────────────────────────────────────────────
export function ScenariosView() {
  const { activeFlow } = useApp();
  if (!activeFlow) return null;
  if (!activeFlow.modules.length) {
    return (
      <div className="empty-state">
        <div className="es-icon">📋</div>
        <div className="es-title">No modules yet</div>
        <div className="es-sub">Add modules using the button in the header</div>
      </div>
    );
  }
  return (
    <div>
      {activeFlow.modules.map((mod) => (
        <ModuleCard key={mod.id} mod={mod} flow={activeFlow} />
      ))}
    </div>
  );
}
