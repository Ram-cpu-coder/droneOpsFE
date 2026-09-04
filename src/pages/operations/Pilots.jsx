import { useCallback, useState } from "react";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
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
export default function Pilots({user}) {
  const loader=useCallback(()=>droneOpsApi.pilots.list(),[]);
  const {data:pilots,error,isLoading,refresh,setData}=useApiResource(loader);
  const [selected,setSelected]=useState(null);const [editing,setEditing]=useState(false);
  const [form,setForm]=useState({certificationExpiry:"",licences:[]});const [busy,setBusy]=useState(false);const [feedback,setFeedback]=useState("");
  const canManage=hasClientPermission(user,"pilots:manage");
  const choose=p=>{setSelected(p);setEditing(false);setFeedback("");setForm({certificationExpiry:dateValue(p.pilotCredentials?.certificationExpiry),licences:(p.pilotCredentials?.licences??[]).map(l=>({...l,expiresAt:dateValue(l.expiresAt)}))});};
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
    {selected&&<div className="modal-backdrop"><div className="modal-dialog registration-dialog" role="dialog" aria-modal="true" aria-label="Pilot profile"><div className="modal-header"><div><p className="eyebrow">Pilot Profile</p><h2>{selected.name}</h2></div><ActionButton onClick={()=>setSelected(null)}>Close</ActionButton></div><div className="modal-body"><div className="form-section">
      <h3>{selected.name}</h3><p>{selected.email}</p><p>Certification: {validity(selected.pilotCredentials?.certificationExpiry)}</p>
      {canManage&&<button className="secondary-button" type="button" onClick={()=>setEditing(v=>!v)}>{editing?"Cancel edit":"Edit credentials"}</button>}
      {editing?<form className="operations-form" onSubmit={save}>
        <label className="field">Certification expiry<input type="date" value={form.certificationExpiry} onChange={e=>setForm(f=>({...f,certificationExpiry:e.target.value}))}/></label>
        {form.licences.map((l,i)=><fieldset key={i}><legend>Licence</legend>{[["type","Type"],["number","Number"],["expiresAt","Expiry"]].map(([key,label])=><label key={key}>{label}<input required={key!=="expiresAt"} type={key==="expiresAt"?"date":"text"} value={l[key]} onChange={e=>setForm(f=>({...f,licences:f.licences.map((item,j)=>j===i?{...item,[key]:e.target.value}:item)}))}/></label>)}<button type="button" className="icon-button" title="Remove licence" aria-label="Remove licence" onClick={()=>setForm(f=>({...f,licences:f.licences.filter((_,j)=>j!==i)}))}><Trash2 size={16}/></button></fieldset>)}
        <button className="secondary-button" type="button" onClick={()=>setForm(f=>({...f,licences:[...f.licences,{type:"RePL",number:"",expiresAt:""}]}))}><Plus size={16}/>Add licence</button>
        <button className="primary-button" disabled={busy} type="submit"><Save size={16}/>{busy?"Saving...":"Save credentials"}</button>
      </form>:<>{(selected.pilotCredentials?.licences??[]).map((l,i)=><section className="pilot-licence" key={i}><strong>{l.type}</strong><dl><dt>Licence number</dt><dd>{l.number}</dd><dt>Expiry</dt><dd>{dateValue(l.expiresAt)||"Not recorded"}</dd><dt>Status</dt><dd>{validity(l.expiresAt)}</dd></dl></section>)}{!selected.pilotCredentials?.licences?.length&&<p>No licences recorded.</p>}</>}
    </div></div></div></div>}
  </div>;
}
