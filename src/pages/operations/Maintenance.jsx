import { useCallback, useState } from "react";
import { Plus, RefreshCw, Save } from "lucide-react";
import { useApiResource } from "../../hooks/useApiResource";
import { droneOpsApi } from "../../services/droneOpsApi";
import { hasClientPermission } from "../../features/auth/accessControl";
import DataTable from "../../components/common/DataTable";
import SectionHeader from "../../components/common/SectionHeader";
import ActionButton from "../../components/common/ActionButton";
import StatusBadge from "../../components/common/StatusBadge";

const blank=()=>({droneId:"",type:"Scheduled inspection",triggerType:"CALENDAR",status:"SCHEDULED",dueAt:"",notes:"",correctiveAction:""});
export default function Maintenance({user}) {
  const load=useCallback(()=>droneOpsApi.maintenance.list(),[]);const loadDrones=useCallback(()=>droneOpsApi.drones.list(),[]);
  const {data:records,error,isLoading,refresh,setData}=useApiResource(load);const {data:drones,error:droneError}=useApiResource(loadDrones);
  const [editing,setEditing]=useState(false);const [id,setId]=useState(null);const [form,setForm]=useState(blank);const [busy,setBusy]=useState(false);const [feedback,setFeedback]=useState("");
  const canManage=hasClientPermission(user,"maintenance:manage");
  const release=async recordId=>{
    setBusy(true);setFeedback("");
    try{await droneOpsApi.maintenance.release(recordId);await refresh();setFeedback("Drone returned to service.");}
    catch(e){setFeedback(e.message);}finally{setBusy(false);}
  };
  const edit=record=>{setId(record.id);setForm({droneId:record.droneId,type:record.type,triggerType:record.triggerType,status:record.status,dueAt:record.dueAt?.slice(0,10)??"",notes:record.notes??"",correctiveAction:record.correctiveAction??""});setEditing(true);setFeedback("");};
  const save=async e=>{e.preventDefault();setBusy(true);setFeedback("");try{
    const payload={...form,dueAt:form.dueAt?new Date(`${form.dueAt}T00:00:00Z`).toISOString():null};
    const record=id?await droneOpsApi.maintenance.update(id,payload):await droneOpsApi.maintenance.create(payload);
    setData(rows=>[record,...rows.filter(r=>r.id!==record.id)]);setEditing(false);setFeedback("Maintenance record saved.");
  }catch(e){setFeedback(e.message);}finally{setBusy(false);}};
  const rows=records.map(r=>({...r, droneCode:r.drone?.droneCode, displayStatus:!["COMPLETED","CANCELLED"].includes(r.status)&&r.dueAt&&new Date(r.dueAt)<new Date()?"OVERDUE":r.status, due:r.dueAt?.slice(0,10)||"Not scheduled", completed:r.completedAt?.slice(0,10)||"--"}));
  const columns=[{key:"droneCode",label:"Drone"},{key:"type",label:"Work",render:r=><button className="link-button strong-link" type="button" onClick={()=>edit(r)}>{r.type}</button>},{key:"displayStatus",label:"Status",filterable:true,render:r=><StatusBadge>{r.displayStatus}</StatusBadge>},{key:"due",label:"Due"},{key:"completed",label:"Completed"}];
  const closed=["COMPLETED","CANCELLED"].includes(form.status)&&records.some(r=>r.id===id&&["COMPLETED","CANCELLED"].includes(r.status));
  return <div className="page-stack operations-module">
    {canManage&&records.filter(r=>r.status==="COMPLETED"&&r.drone?.status==="MAINTENANCE").filter((r,i,rows)=>rows.findIndex(v=>v.droneId===r.droneId)===i).map(r=><div className="operations-toolbar" key={r.id}><span>{r.drone.droneCode}: service completed, awaiting release</span><button type="button" className="primary-button" disabled={busy} onClick={()=>release(r.id)}>Return to service</button></div>)}
    {(error||droneError)&&<div className="auth-alert" role="alert">{error||droneError}</div>}{feedback&&<p role="status">{feedback}</p>}
    <div className="panel"><SectionHeader title="Maintenance Records" action={<div className="form-actions"><ActionButton icon={RefreshCw} isLoading={isLoading} onClick={refresh}>Refresh</ActionButton>{canManage&&<ActionButton variant="primary" icon={Plus} onClick={()=>{setId(null);setForm(blank());setEditing(true);}}>Schedule maintenance</ActionButton>}</div>} /><DataTable columns={columns} rows={rows} getRowKey={r=>r.id} onRowClick={edit} searchPlaceholder="Search maintenance" emptyMessage={isLoading?"Loading maintenance...":"No maintenance records."}/></div>
    <div className="panel"><SectionHeader title="Service Schedule"/><DataTable rows={drones} getRowKey={d=>d.id} columns={[{key:"droneCode",label:"Drone"},{key:"status",label:"Status",render:d=><StatusBadge>{d.status}</StatusBadge>},{key:"flightHours",label:"Flight Hours"},{key:"nextMaintenanceDate",label:"Next Inspection",render:d=>d.nextMaintenanceDate?.slice(0,10)||"Not scheduled"},{key:"certificationStatus",label:"Certification",render:d=><StatusBadge>{d.certificationStatus}</StatusBadge>}]}/></div>
    {editing&&<div className="modal-backdrop"><form className="modal-dialog registration-dialog" role="dialog" aria-modal="true" aria-label="Maintenance record" onSubmit={save}><div className="modal-header"><div><p className="eyebrow">Aircraft Maintenance</p><h2>{id?"Maintenance record":"Schedule maintenance"}</h2></div><ActionButton disabled={busy} onClick={()=>setEditing(false)}>Close</ActionButton></div><div className="modal-body"><div className="form-section"><fieldset className="operations-form form-grid" disabled={!canManage||closed||busy}>
        <label className="field">Drone<select required disabled={!!id} value={form.droneId} onChange={e=>setForm(f=>({...f,droneId:e.target.value}))}><option value="">Select drone</option>{drones.map(d=><option key={d.id} value={d.id}>{d.droneCode} · {d.flightHours} hours</option>)}</select></label>
        <label className="field">Work type<input required value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}/></label>
        <label className="field">Trigger<select value={form.triggerType} onChange={e=>setForm(f=>({...f,triggerType:e.target.value}))}>{["CALENDAR","HOURS","EVENT"].map(s=><option key={s}>{s}</option>)}</select></label>
        <label className="field">Status<select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>{["SCHEDULED","IN_PROGRESS","COMPLETED","CANCELLED","OVERDUE"].map(s=><option key={s}>{s}</option>)}</select></label>
        <label className="field">Due date<input type="date" value={form.dueAt} onChange={e=>setForm(f=>({...f,dueAt:e.target.value}))}/></label>
        <label className="field">Notes<textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></label>
        <label className="field">Work performed<textarea required={form.status==="COMPLETED"} value={form.correctiveAction} onChange={e=>setForm(f=>({...f,correctiveAction:e.target.value}))}/></label>
      </fieldset></div></div><div className="modal-footer"><ActionButton disabled={busy} onClick={()=>setEditing(false)}>Close</ActionButton>{canManage&&!closed&&<ActionButton variant="primary" icon={Save} disabled={busy} isLoading={busy} type="submit">Save maintenance</ActionButton>}</div></form></div>}
  </div>;
}
