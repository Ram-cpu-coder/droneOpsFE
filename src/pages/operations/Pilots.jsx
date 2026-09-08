import { useCallback, useState } from "react";
import { CalendarClock, Mail, Plus, RefreshCw, Save, Trash2, UserRound, X } from "lucide-react";
import { useApiResource } from "../../hooks/useApiResource";
import { droneOpsApi } from "../../services/droneOpsApi";
import { hasClientPermission } from "../../features/auth/accessControl";
import DataTable from "../../components/common/DataTable";
import SectionHeader from "../../components/common/SectionHeader";
import ActionButton from "../../components/common/ActionButton";
import StatusBadge from "../../components/common/StatusBadge";

const dateValue=value=>value?value.slice(0,10):"";
const iso=value=>value?new Date(`${value}T00:00:00Z`).toISOString():null;
const validity=value=>!value?"Not recorded":new Date(value)<new Date()?"Expired":"Current";
const statusTone=value=>validity(value)==="Expired"?"danger":validity(value)==="Current"?"success":"neutral";
const blankLicence=()=>({type:"RePL",number:"",expiresAt:""});
export default function Pilots({user}) {
  const loader=useCallback(()=>droneOpsApi.pilots.list(),[]);
  const {data:pilots,error,isLoading,refresh,setData}=useApiResource(loader);
  const [selected,setSelected]=useState(null);const [editing,setEditing]=useState(false);
  const [form,setForm]=useState({certificationExpiry:"",licences:[]});const [busy,setBusy]=useState(false);const [feedback,setFeedback]=useState("");
  const canManage=hasClientPermission(user,"pilots:manage");
  const choose=p=>{setSelected(p);setEditing(false);setFeedback("");setForm({certificationExpiry:dateValue(p.pilotCredentials?.certificationExpiry),licences:(p.pilotCredentials?.licences??[]).map(l=>({...l,expiresAt:dateValue(l.expiresAt)}))});};
  const cancelEdit=()=>selected&&choose(selected);
  const updateLicence=(index,key,value)=>setForm(f=>({...f,licences:f.licences.map((item,j)=>j===index?{...item,[key]:value}:item)}));
  const save=async e=>{e.preventDefault();setBusy(true);setFeedback("");try{
    const p=await droneOpsApi.pilots.updateCredentials(selected.id,{certificationExpiry:iso(form.certificationExpiry),licences:form.licences.map(l=>({...l,expiresAt:iso(l.expiresAt)}))});
    setData(rows=>rows.map(row=>row.id===p.id?p:row));choose(p);setFeedback("Pilot credentials saved.");
  }catch(e){setFeedback(e.message);}finally{setBusy(false);}};
  const filtered=pilots;
  const columns = [
    { key: "name", label: "Pilot", render: p => <button type="button" className="link-button strong-link" onClick={() => choose(p)}>{p.name}</button> },
    { key: "email", label: "Email" },
    { key: "licencesText", label: "Licences" },
    { key: "expiry", label: "Certification Expiry" },
    { key: "credentialStatus", label: "Status", render: p => <StatusBadge>{validity(p.pilotCredentials?.certificationExpiry)}</StatusBadge> }
  ];
  return <div className="page-stack operations-module">
    {error&&<div className="auth-alert" role="alert">{error}</div>}{feedback&&<p role="status">{feedback}</p>}
    <div className="panel"><SectionHeader title="Pilot Directory" action={<ActionButton icon={RefreshCw} isLoading={isLoading} onClick={refresh}>Refresh</ActionButton>} />
      <DataTable columns={columns} rows={filtered.map(p => ({ ...p, licencesText: (p.pilotCredentials?.licences ?? []).map(l => `${l.type} ${l.number}`).join(", ") || "Not recorded", expiry: dateValue(p.pilotCredentials?.certificationExpiry) || "Not recorded" }))} getRowKey={p => p.id} onRowClick={choose} searchPlaceholder="Search pilots or licences" emptyMessage={isLoading ? "Loading pilots..." : "No registered remote pilots found."} />
    </div>
    {selected&&<div className="modal-backdrop"><div className="modal-dialog profile-dialog registration-dialog pilot-profile-dialog" role="dialog" aria-modal="true" aria-label="Pilot profile"><div className="modal-header pilot-profile-header"><div><p className="eyebrow">Pilot Profile</p><h2>{selected.name}</h2><p>{selected.email}</p></div><div className="pilot-profile-actions">{canManage&&<ActionButton icon={editing?X:null} onClick={()=>editing?cancelEdit():setEditing(true)}>{editing?"Cancel":"Edit credentials"}</ActionButton>}<ActionButton onClick={()=>setSelected(null)}>Close</ActionButton></div></div><div className="modal-body"><div className="pilot-profile-grid">
      <section className="pilot-summary-card">
        <div className="pilot-avatar" aria-hidden="true"><UserRound size={24}/></div>
        <div>
          <h3>{selected.name}</h3>
          <p><Mail size={14}/>{selected.email}</p>
        </div>
        <div className="pilot-summary-metrics">
          <span><strong>{selected.pilotCredentials?.licences?.length??0}</strong><small>licences</small></span>
          <span className={`pilot-status-pill ${statusTone(selected.pilotCredentials?.certificationExpiry)}`}><strong>{validity(selected.pilotCredentials?.certificationExpiry)}</strong><small>certification</small></span>
        </div>
      </section>
      {editing?<form className="operations-form pilot-credentials-form" onSubmit={save}>
        <div className="pilot-form-head">
          <div>
            <h3>Edit credentials</h3>
            <p>Keep certification dates and licence records clear before assigning this pilot to operations.</p>
          </div>
          <span className={`pilot-status-pill ${statusTone(form.certificationExpiry)}`}>{validity(form.certificationExpiry)}</span>
        </div>
        <label className="field pilot-date-field"><span><CalendarClock size={15}/>Certification expiry</span><input type="date" value={form.certificationExpiry} onChange={e=>setForm(f=>({...f,certificationExpiry:e.target.value}))}/></label>
        <div className="pilot-licence-editor">
          <div className="pilot-licence-editor-head">
            <h4>Licences</h4>
            <button className="secondary-button compact" type="button" onClick={()=>setForm(f=>({...f,licences:[...f.licences,blankLicence()]}))}><Plus size={16}/>Add licence</button>
          </div>
          {!form.licences.length&&<p className="empty-state">No licences added yet.</p>}
          {form.licences.map((licence,index)=><section className="pilot-licence-edit-card" key={index}>
            <div className="pilot-licence-edit-title">
              <strong>{licence.type||`Licence ${index+1}`}</strong>
              <button type="button" className="icon-button" title="Remove licence" aria-label="Remove licence" onClick={()=>setForm(f=>({...f,licences:f.licences.filter((_,j)=>j!==index)}))}><Trash2 size={16}/></button>
            </div>
            <div className="pilot-licence-fields">
              <label className="field">Type<input required type="text" value={licence.type} onChange={e=>updateLicence(index,"type",e.target.value)}/></label>
              <label className="field">Number<input required type="text" value={licence.number} onChange={e=>updateLicence(index,"number",e.target.value)}/></label>
              <label className="field">Expiry<input type="date" value={licence.expiresAt} onChange={e=>updateLicence(index,"expiresAt",e.target.value)}/></label>
            </div>
          </section>)}
        </div>
        <div className="pilot-form-footer">
          <button className="secondary-button" type="button" disabled={busy} onClick={cancelEdit}>Cancel</button>
          <button className="primary-button" disabled={busy} type="submit"><Save size={16}/>{busy?"Saving...":"Save credentials"}</button>
        </div>
      </form>:<section className="pilot-credentials-readout">
        <div className="pilot-form-head">
          <div>
            <h3>Credentials</h3>
            <p>Certification and licences recorded for this pilot.</p>
          </div>
          <span className={`pilot-status-pill ${statusTone(selected.pilotCredentials?.certificationExpiry)}`}>{validity(selected.pilotCredentials?.certificationExpiry)}</span>
        </div>
        {(selected.pilotCredentials?.licences??[]).map((licence,index)=><section className="pilot-licence" key={index}>
          <div><strong>{licence.type}</strong><span>{validity(licence.expiresAt)}</span></div>
          <dl><div><dt>Licence number</dt><dd>{licence.number}</dd></div><div><dt>Expiry</dt><dd>{dateValue(licence.expiresAt)||"Not recorded"}</dd></div></dl>
        </section>)}
        {!selected.pilotCredentials?.licences?.length&&<p className="empty-state">No licences recorded.</p>}
      </section>}
    </div></div></div></div>}
  </div>;
}
