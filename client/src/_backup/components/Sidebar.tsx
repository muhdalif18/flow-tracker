import { useState } from "react";
import { useApp } from "../AppContext";
import { flowStats, modStatus } from "../utils";

export function Sidebar() {
  const { state, activeFlow, setActive, createFlow, deleteFlow } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await createFlow(name.trim(), desc.trim());
    setName("");
    setDesc("");
    setShowForm(false);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Delete this flow and all its data?")) return;
    await deleteFlow(id);
  };

  const getDot = (flow: (typeof state.flows)[0]) => {
    const hasBlocker = flow.modules.some((m) => modStatus(m) === "blocked");
    const st = flowStats(flow);
    if (hasBlocker) return "#dc2626";
    if (st.fail > 0) return "#d97706";
    if (st.pass > 0 && st.untested === 0 && st.fail === 0) return "#059669";
    if (st.pass > 0) return "#3b82f6";
    return "#475569";
  };

  return (
    <aside className="sidebar">
      <div className="sb-header">
        <div className="sb-logo">
          <div className="sb-mark">TT</div>
          <div>
            <div className="sb-title">STSDS Flow Tracker</div>
            <div className="sb-sub">Traceability Matrix</div>
          </div>
        </div>
      </div>

      <div className="sb-section-label">Flows</div>

      <div className="flow-list">
        {state.flows.length === 0 && !state.loading && (
          <div className="sb-empty">No flows yet. Create one below.</div>
        )}
        {state.flows.map((flow) => (
          <div
            key={flow.id}
            className={`flow-item ${flow.id === state.activeFlowId ? "active" : ""}`}
            onClick={() => setActive(flow.id)}
          >
            <div className="fi-dot" style={{ background: getDot(flow) }} />
            <div className="fi-name">{flow.name}</div>
            <button
              className="fi-del"
              onClick={(e) => handleDelete(e, flow.id)}
              title="Delete flow"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {showForm ? (
        <form className="sb-form" onSubmit={handleCreate}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Flow name *"
            required
            className="sb-input"
          />
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Description (optional)"
            className="sb-input"
          />
          <div className="sb-form-btns">
            <button
              type="button"
              className="sb-cancel"
              onClick={() => {
                setShowForm(false);
                setName("");
                setDesc("");
              }}
            >
              Cancel
            </button>
            <button type="submit" className="sb-create">
              Create
            </button>
          </div>
        </form>
      ) : (
        <button className="sb-new" onClick={() => setShowForm(true)}>
          + New Flow
        </button>
      )}
    </aside>
  );
}
