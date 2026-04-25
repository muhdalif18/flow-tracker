import { useState } from 'react';
import { useApp } from '../AppContext';
import { modStatus, modStats, isGated, STATUS_META, today } from '../utils';
import type { Flow, Module, Scenario } from '../types';

function AddScenarioModal({ moduleId, onClose }: { moduleId: string; onClose: () => void }) {
  const { addScenario } = useApp();
  const [blid, setBlid] = useState('');
  const [desc, setDesc] = useState('');
  const [exp,  setExp]  = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    await addScenario(moduleId, { blid: blid.trim(), description: desc.trim(), expected: exp.trim() });
    setBusy(false); onClose();
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3>Add scenario</h3>
        <form onSubmit={submit}>
          <label>BLID <span className="label-hint">(from URS)</span></label>
          <input autoFocus value={blid} onChange={e=>setBlid(e.target.value)} placeholder="e.g. 7-1-0-0" className="mono-input" required />
          <label>Scenario description</label>
          <input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="e.g. First-time application submission" required />
          <label>Expected result</label>
          <textarea value={exp} onChange={e=>setExp(e.target.value)} rows={3} placeholder="What should happen?" required />
          <div className="modal-actions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>{busy?'Adding…':'Add Scenario'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ExpandPanel({ sc }: { sc: Scenario }) {
  const { updateScenario, deleteScenario, uploadImage } = useApp();
  const [uploading, setUploading] = useState(false);
  const upd = (data: object) => updateScenario(sc.id, data);

  const mark = (status: Scenario['status']) => {
    const d: Partial<Scenario> = { status };
    if (status === 'pass' && !sc.date_tested) d.date_tested = today();
    if (status === 'fail' && !sc.date_tested) d.date_tested = today();
    if (status === 'untested') { d.issue_type = null; d.date_tested = ''; }
    upd(d);
  };

  const handleImg = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10*1024*1024) { alert('Max 10MB'); return; }
    setUploading(true);
    const url = await uploadImage(file);
    await upd({ evidence_image: url });
    setUploading(false);
  };

  return (
    <div className="expand-panel">
      <div className="ep-expected"><strong>Expected:</strong> {sc.expected}</div>
      <div className="ep-controls">
        <div className="ep-ctrl">
          <div className="ep-label">Status</div>
          <div className="ep-btn-row">
            <button className={`ep-st-btn ${sc.status==='pass'?'ep-pass':''}`} onClick={()=>mark('pass')}>✓ Pass</button>
            <button className={`ep-st-btn ${sc.status==='fail'?'ep-fail':''}`} onClick={()=>mark('fail')}>✗ Fail</button>
            <button className={`ep-st-btn ${sc.status==='untested'?'ep-nt':''}`} onClick={()=>mark('untested')}>— Reset</button>
          </div>
        </div>
        {sc.status==='fail' && (
          <div className="ep-ctrl">
            <div className="ep-label">Issue type</div>
            <div className="ep-btn-row">
              <button className={`ep-issue-btn ep-blocker ${sc.issue_type==='blocker'?'on':''}`} onClick={()=>upd({issue_type: sc.issue_type==='blocker'?null:'blocker'})}>🔒 Blocker</button>
              <button className={`ep-issue-btn ep-major  ${sc.issue_type==='major'  ?'on':''}`} onClick={()=>upd({issue_type: sc.issue_type==='major'  ?null:'major'  })}>⚠ Major</button>
              <button className={`ep-issue-btn ep-minor  ${sc.issue_type==='minor'  ?'on':''}`} onClick={()=>upd({issue_type: sc.issue_type==='minor'  ?null:'minor'  })}>● Minor</button>
            </div>
          </div>
        )}
      </div>
      <div className="ep-fields">
        <div className="ep-field">
          <label>Date tested</label>
          <input type="text" defaultValue={sc.date_tested} placeholder={today()} onBlur={e=>upd({date_tested:e.target.value})} />
        </div>
        <div className="ep-field">
          <label>ADO Ticket</label>
          <input type="text" defaultValue={sc.ado_ticket} placeholder="#1234 or URL" onBlur={e=>upd({ado_ticket:e.target.value})} />
        </div>
        <div className="ep-field ep-wide">
          <label>Evidence URL</label>
          <input type="url" defaultValue={sc.evidence_url} placeholder="https://sharepoint… or video link" onBlur={e=>upd({evidence_url:e.target.value})} />
        </div>
        <div className="ep-field">
          <label>Screenshot {uploading && <span className="uploading">Uploading…</span>}</label>
          <input type="file" accept="image/*" onChange={handleImg} />
          {sc.evidence_image && <img src={sc.evidence_image} alt="evidence" className="ev-thumb" onClick={()=>window.open(sc.evidence_image!)} />}
        </div>
      </div>
      <div className="ep-field ep-full">
        <label>Remarks</label>
        <textarea rows={2} defaultValue={sc.remarks} placeholder="Actual result, observations…" onBlur={e=>upd({remarks:e.target.value})} />
      </div>
      <div className="ep-footer">
        {sc.ado_ticket && (sc.ado_ticket.startsWith('http')
          ? <a href={sc.ado_ticket} target="_blank" rel="noreferrer" className="ado-link">🔗 ADO Ticket</a>
          : <span className="ado-badge"># {sc.ado_ticket.replace('#','').trim()}</span>)}
        {sc.evidence_url && <a href={sc.evidence_url} target="_blank" rel="noreferrer" className="ev-link">📎 Evidence</a>}
        <button className="btn-del-sc" onClick={()=>{ if(confirm('Delete scenario?')) deleteScenario(sc.id); }}>Delete</button>
      </div>
    </div>
  );
}

function ScenarioRow({ sc }: { sc: Scenario }) {
  const { state, toggleExpand, updateScenario } = useApp();
  const isExp = state.expanded.has(sc.id);
  const next  = sc.status==='untested'?'pass':sc.status==='pass'?'fail':'untested';
  const quickMark = () => {
    const d: Partial<Scenario> = { status: next };
    if (next==='pass' && !sc.date_tested) d.date_tested = today();
    if (next==='fail' && !sc.date_tested) d.date_tested = today();
    if (next==='untested') { d.issue_type = null; d.date_tested=''; }
    updateScenario(sc.id, d);
  };
  return (
    <>
      <tr className={`sc-row ${sc.status==='pass'?'row-pass':sc.status==='fail'?'row-fail':''}`}>
        <td><span className="blid">{sc.blid}</span></td>
        <td className="sc-desc">{sc.description}</td>
        <td style={{textAlign:'center'}}>
          <button className={`sc-st-btn sst-${sc.status}`} onClick={quickMark}>
            {sc.status==='pass'?'✓ PASS':sc.status==='fail'?'✗ FAIL':'— N/T'}
          </button>
        </td>
        <td style={{textAlign:'center'}}>
          <button className={`expand-btn ${isExp?'open':''}`} onClick={()=>toggleExpand(sc.id)}>{isExp?'▲':'▼'}</button>
        </td>
      </tr>
      {isExp && (
        <tr className="exp-row">
          <td colSpan={4}><ExpandPanel sc={sc} /></td>
        </tr>
      )}
    </>
  );
}

function ModuleCard({ mod, flow }: { mod: Module; flow: Flow }) {
  const { deleteModule, moveModule } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const st      = modStatus(mod);
  const sm      = STATUS_META[st];
  const ms      = modStats(mod);
  const gated   = isGated(flow, flow.modules.indexOf(mod));
  const sideC   = mod.side==='eDS'?'#3b82f6':'#7c3aed';
  const borders: Record<string,string> = {complete:'#059669',blocked:'#dc2626',major:'#d97706',minor:'#d97706',progress:'#3b82f6',pending:'#e2e8f0',empty:'#e2e8f0'};

  return (
    <div className="mod-section" style={{borderLeftColor: borders[st]??'#e2e8f0'}}>
      <div className="mod-header">
        <div className="mod-hdr-left">
          <span className="mod-badge" style={{background:sideC+'18',color:sideC,borderColor:sideC+'40'}}>{mod.label}</span>
          <div>
            <div className="mod-name">{mod.name}</div>
            <div className="mod-side">{mod.side}{mod.note?` · ${mod.note}`:''}</div>
          </div>
        </div>
        <div className="mod-hdr-right">
          <span className={`st-badge ${sm.cls}`}>{sm.label}</span>
          <span className="mod-counts">
            <span style={{color:'#059669'}}>{ms.pass}P</span>{' '}
            <span style={{color:'#dc2626'}}>{ms.fail}F</span>{' '}
            <span style={{color:'#d97706'}}>{ms.untested}U</span>
          </span>
          <button className="btn-xs" onClick={()=>setShowAdd(true)}>+ Scenario</button>
          <button className="btn-xs btn-ghost" onClick={()=>moveModule(flow.id,mod.id,-1)} title="Move up">↑</button>
          <button className="btn-xs btn-ghost" onClick={()=>moveModule(flow.id,mod.id, 1)} title="Move down">↓</button>
          <button className="btn-xs btn-danger" onClick={()=>{if(confirm('Delete module and all its scenarios?'))deleteModule(mod.id);}}>×</button>
        </div>
      </div>
      {gated && <div className="gate-banner">⛔ Gated — a previous module has a Blocker issue. Resolve it before testing here.</div>}
      {mod.scenarios.length===0
        ? <div className="sc-empty">No scenarios yet — <button className="link-btn" onClick={()=>setShowAdd(true)}>add first scenario</button></div>
        : <table className="sc-table"><thead><tr>
            <th style={{width:90}}>BLID</th><th>Scenario</th>
            <th style={{width:78,textAlign:'center'}}>Status</th><th style={{width:32}} />
          </tr></thead><tbody>
            {mod.scenarios.map(sc => <ScenarioRow key={sc.id} sc={sc} />)}
          </tbody></table>
      }
      {showAdd && <AddScenarioModal moduleId={mod.id} onClose={()=>setShowAdd(false)} />}
    </div>
  );
}

export function ScenariosView() {
  const { activeFlow } = useApp();
  if (!activeFlow) return null;
  if (!activeFlow.modules.length)
    return <div className="empty-state"><div className="es-icon">📋</div><div className="es-title">No modules yet</div><div className="es-sub">Add modules using the button in the header</div></div>;
  return <div>{activeFlow.modules.map(mod => <ModuleCard key={mod.id} mod={mod} flow={activeFlow} />)}</div>;
}
