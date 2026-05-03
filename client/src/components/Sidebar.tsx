import React, { useState } from "react";
import { useApp } from "../AppContext";
import { useAuth } from "../AuthContext";
import { flowStats, modStatus } from "../utils";
import type { Flow } from "../types";
import { useConfirm } from "./ConfirmModal";
import { ChangePasswordModal } from "./ChangePasswordModal";

function NavIcoDash() {
  return (
    <svg
      className="nav-ico"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  );
}

function NavIcoTrace() {
  return (
    <svg
      className="nav-ico"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M5 7h6M5 10h4" strokeLinecap="round" />
    </svg>
  );
}

function NavIcoPlay() {
  return (
    <svg
      className="nav-ico"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <circle cx="8" cy="8" r="6.3" />
      <path d="M7 5.5l4 2.5-4 2.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function getDotColor(flow: Flow) {
  const hasBlocker = flow.modules.some((m) => modStatus(m) === "blocked");
  const st = flowStats(flow);
  if (hasBlocker) return "#dc2626";
  if (st.fail > 0) return "#d97706";
  if (st.pass > 0 && st.untested === 0 && st.fail === 0) return "#16a34a";
  if (st.pass > 0) return "#1d4ed8";
  return "#475569";
}

function FlowItem({ flow, indent = false }: { flow: Flow; indent?: boolean }) {
  const { state, setActive, updateFlow, deleteFlow } = useApp();
  const { isOwner } = useAuth();
  const { confirm, modal } = useConfirm();
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState("");
  const st = flowStats(flow);
  const dot = getDotColor(flow);
  const pct = st.total > 0 ? Math.round((st.pass / st.total) * 100) : 0;
  const isActive = flow.id === state.activeFlowId;
  const owner = isOwner(flow.created_by);

  const startRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRenameVal(flow.name);
    setRenaming(true);
  };

  const commitRename = async () => {
    const v = renameVal.trim();
    if (v && v !== flow.name) await updateFlow(flow.id, { name: v });
    setRenaming(false);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (
      !(await confirm({
        message: `Delete "${flow.name}" and all its data?`,
        confirmLabel: "Delete",
      }))
    )
      return;
    await deleteFlow(flow.id);
  };

  return (
    <>
      {modal}
      <div
        className={`flow-item ${isActive ? "active" : ""} ${indent ? "flow-item--child" : ""}`}
        onClick={() => !renaming && setActive(flow.id)}
      >
        <div className="fi-dot" style={{ background: dot }} />
        <div className="fi-info">
          {renaming ? (
            <input
              autoFocus
              className="fi-rename-input"
              value={renameVal}
              onChange={(e) => setRenameVal(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setRenaming(false);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className="fi-name">{flow.name}</div>
          )}
          {st.total > 0 && (
            <div className="fi-progress">
              <div
                className="fi-progress-fill"
                style={{ width: `${pct}%`, background: dot }}
              />
            </div>
          )}
        </div>
        {owner && !renaming && (
          <div className="fi-actions">
            <button
              className="fi-action-btn"
              onClick={startRename}
              title="Rename flow"
            >
              ✎
            </button>
            <button
              className="fi-del"
              onClick={handleDelete}
              title="Delete flow"
            >
              ×
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function GroupSection({ name, flows }: { name: string; flows: Flow[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState("");
  const { state, updateFlow } = useApp();
  const { isOwner } = useAuth();
  const hasActive = flows.some((f) => f.id === state.activeFlowId);
  const canRename = flows.some((f) => isOwner(f.created_by));

  const startRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRenameVal(name);
    setRenaming(true);
  };

  const commitRename = async () => {
    const v = renameVal.trim();
    if (v && v !== name)
      await Promise.all(flows.map((f) => updateFlow(f.id, { group_name: v })));
    setRenaming(false);
  };

  return (
    <div className={`flow-group ${hasActive ? "flow-group--active" : ""}`}>
      <div
        className="flow-group-header"
        onClick={() => !renaming && setCollapsed((c) => !c)}
      >
        <svg
          className="flow-group-chevron"
          style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {renaming ? (
          <input
            autoFocus
            className="fi-rename-input fg-rename-input"
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setRenaming(false);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flow-group-name">{name}</span>
        )}
        {!renaming && <span className="flow-group-count">{flows.length}</span>}
        {canRename && !renaming && (
          <button
            className="fi-action-btn fg-rename-btn"
            onClick={startRename}
            title="Rename group"
          >
            ✎
          </button>
        )}
      </div>
      {!collapsed && (
        <div className="flow-group-body">
          {flows.map((f) => (
            <FlowItem key={f.id} flow={f} indent />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const { state, setTab, createFlow } = useApp();
  const { user, logout } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [showChgPw, setShowChgPw] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [groupMode, setGroupMode] = useState<
    "PINDAAN" | "BANTAHAN DAN RAYUAN" | "others"
  >("PINDAAN");
  const [customGroup, setCustomGroup] = useState("");

  const grouped = new Map<string, Flow[]>();
  for (const f of state.flows) {
    const key = f.group_name ?? "(Ungrouped)";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(f);
  }

  const resolvedGroup = groupMode === "others" ? customGroup.trim() : groupMode;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !resolvedGroup) return;
    await createFlow(name.trim(), desc.trim(), resolvedGroup);
    setName("");
    setDesc("");
    setGroupMode("PINDAAN");
    setCustomGroup("");
    setShowForm(false);
  };

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="sb-header">
        <img
          src="/myphoto.jpg"
          className="sb-mark"
          style={{ objectFit: "cover", padding: 0 }}
          alt="logo"
        />
        <div>
          <div className="sb-title">Flow Tracker</div>
          <div className="sb-sub">V2.5.0-STABLE - by: SyedAlif</div>
        </div>
      </div>

      {/* Main nav */}
      <div className="side-section">Main</div>
      <nav className="nav">
        <div
          className={`nav-item ${state.activeTab === "blid" ? "on" : ""}`}
          onClick={() => setTab("blid")}
        >
          <NavIcoDash />
          Dashboard
        </div>
        <div
          className={`nav-item ${state.activeTab === "diagram" ? "on" : ""}`}
          onClick={() => setTab("diagram")}
        >
          <NavIcoTrace />
          Traceability
        </div>
        <div
          className={`nav-item ${state.activeTab === "scenarios" ? "on" : ""}`}
          onClick={() => setTab("scenarios")}
        >
          <NavIcoPlay />
          Execution
        </div>
      </nav>

      {/* Flows */}
      <div className="sb-section-label">Flows</div>
      <div className="flow-list">
        {state.loading && <div className="sb-empty">Loading…</div>}
        {!state.loading && state.flows.length === 0 && (
          <div className="sb-empty">
            No flows yet.
            <br />
            Create one below.
          </div>
        )}

        {Array.from(grouped.entries()).map(([groupName, flows]) => (
          <GroupSection key={groupName} name={groupName} flows={flows} />
        ))}
      </div>

      {/* Create form — pinned above footer */}
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
          <select
            value={groupMode}
            onChange={(e) =>
              setGroupMode(
                e.target.value as "PINDAAN" | "BANTAHAN DAN RAYUAN" | "others",
              )
            }
            className="sb-input"
            required
          >
            <option value="PINDAAN">PINDAAN</option>
            <option value="BANTAHAN DAN RAYUAN">BANTAHAN DAN RAYUAN</option>
            <option value="others">Others…</option>
          </select>
          {groupMode === "others" && (
            <input
              autoFocus
              value={customGroup}
              onChange={(e) => setCustomGroup(e.target.value)}
              placeholder="Group name *"
              required
              className="sb-input"
            />
          )}
          <div className="sb-form-btns">
            <button
              type="button"
              className="sb-cancel"
              onClick={() => {
                setShowForm(false);
                setName("");
                setDesc("");
                setGroupMode("PINDAAN");
                setCustomGroup("");
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

      {/* Footer */}
      <div className="side-foot">
        <div
          style={{
            padding: "6px 12px 8px",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: "var(--blue-2)",
              display: "grid",
              placeItems: "center",
              color: "#fff",
              fontWeight: 700,
              fontSize: 12,
              flexShrink: 0,
            }}
          >
            {user?.username[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--sidebar-ink)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user?.username}
            </div>
            <button
              onClick={() => setShowChgPw(true)}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                fontSize: 10,
                color: "var(--sidebar-muted)",
                cursor: "pointer",
                fontFamily: "var(--sans)",
                textDecoration: "underline",
              }}
            >
              Change password
            </button>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            style={{
              background: "none",
              border: "1px solid rgba(255,255,255,.15)",
              borderRadius: 5,
              color: "var(--sidebar-muted)",
              cursor: "pointer",
              fontSize: 11,
              padding: "3px 7px",
            }}
          >
            Out
          </button>
        </div>
      </div>

      {showChgPw && <ChangePasswordModal onClose={() => setShowChgPw(false)} />}
    </aside>
  );
}
