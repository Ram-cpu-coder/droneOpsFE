import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, PenLine, Play, RadioTower, RotateCcw, Save, ShieldCheck, Trash2, Undo2, RefreshCw } from "lucide-react";
import DataTable from "../../components/common/DataTable";
import GeospatialMap from "../../components/maps/GeospatialMap";
import MissionRouteMap from "../missions/components/MissionRouteMap";
import { droneOpsApi } from "../../services/droneOpsApi";
import { getRealtimeSocket } from "../../services/realtimeClient";
import { hasClientPermission } from "../../features/auth/accessControl";
import { formatDateOnly } from "../../utils/formatters";

const blankZone=()=>({name:"",type:"WARNING",isActive:true,polygon:[]});
const OPERATIONS_FALLBACK_REFRESH_MS = 300000;

export default function LiveOperations({user}) {
  const [tab,setTab]=useState("live");
  const [zones,setZones]=useState([]);const [missions,setMissions]=useState([]);
  const [drones,setDrones]=useState([]);
  const [replaySource,setReplaySource]=useState("mission");
  const [droneId,setDroneId]=useState("");
  const [reload,setReload]=useState(0);
  const [missionId,setMissionId]=useState("");const [records,setRecords]=useState([]);
  const [index,setIndex]=useState(0);const [playing,setPlaying]=useState(false);const [speed,setSpeed]=useState(1);
  const [zone,setZone]=useState(blankZone);const [editingId,setEditingId]=useState(null);
  const [telemetryStatus,setTelemetryStatus]=useState(null);
  const [drawing,setDrawing]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [message,setMessage]=useState("");
  const [showGeofenceList,setShowGeofenceList]=useState(false);
  const requestRef=useRef(0);
  const geofenceTableRef=useRef(null);
  const canManage=hasClientPermission(user,"geofences:manage");
  const refreshZones=useCallback(async()=>{if(document.visibilityState!=="visible")return;try{setZones(await droneOpsApi.geofences.list());}catch(e){setError(e.message);}},[]);
  const refreshTelemetryStatus=useCallback(async()=>{if(document.visibilityState!=="visible")return;try{setTelemetryStatus(await droneOpsApi.telemetry.status());}catch(e){setTelemetryStatus({error:e.message});}},[]);
  useEffect(()=>{
    refreshZones();refreshTelemetryStatus();droneOpsApi.missions.list().then(setMissions).catch(e=>setError(e.message));
    droneOpsApi.drones.list().then(setDrones).catch(e=>setError(e.message));
    const socket=getRealtimeSocket();socket.on("geofences:changed",refreshZones);
    socket.on("operations:telemetry",refreshTelemetryStatus);
    socket.on("connect",refreshZones);
    socket.on("connect",refreshTelemetryStatus);
    const timer=setInterval(refreshZones,OPERATIONS_FALLBACK_REFRESH_MS);
    const telemetryTimer=setInterval(refreshTelemetryStatus,OPERATIONS_FALLBACK_REFRESH_MS);
    return()=>{clearInterval(timer);clearInterval(telemetryTimer);socket.off("geofences:changed",refreshZones);socket.off("operations:telemetry",refreshTelemetryStatus);socket.off("connect",refreshZones);socket.off("connect",refreshTelemetryStatus);};
  },[refreshZones,refreshTelemetryStatus]);
  useEffect(()=>{
    const request=++requestRef.current;setRecords([]);setIndex(0);setPlaying(false);
    const selectedId=replaySource==="mission"?missionId:droneId;
    if(!selectedId){setBusy(false);return;}
    setBusy(true);setError("");
    const load=replaySource==="mission"?droneOpsApi.missions.replay(selectedId):droneOpsApi.telemetry.byDrone(selectedId,2000);
    load.then(rows=>{if(request===requestRef.current)setRecords(rows);})
      .catch(e=>{if(request===requestRef.current)setError(e.message);}).finally(()=>{if(request===requestRef.current)setBusy(false);});
    return()=>{requestRef.current=request+1;};
  },[missionId,droneId,replaySource,reload]);
  useEffect(()=>{
    if(!playing||tab!=="replay")return;
    if(index>=records.length-1){setPlaying(false);return;}
    const timer=setTimeout(()=>setIndex(i=>i+1),1000/speed);return()=>clearTimeout(timer);
  },[playing,index,records.length,speed,tab]);
  const saveZone=async(event)=>{
    event.preventDefault();setBusy(true);setError("");setMessage("");
    try{const saved=editingId?await droneOpsApi.geofences.update(editingId,zone):await droneOpsApi.geofences.create(zone);
      setZones(rows=>[saved,...rows.filter(row=>row.id!==saved.id)]);setEditingId(editingId?saved.id:null);setZone(editingId?{name:saved.name,type:saved.type,isActive:saved.isActive,polygon:saved.polygon}:blankZone());setDrawing(false);setMessage("Geofence saved.");
    }catch(e){setError(e.message);}finally{setBusy(false);}
  };
  const deleteZone=async(targetId=editingId)=>{if(!targetId)return;setBusy(true);setError("");setMessage("");try{await droneOpsApi.geofences.remove(targetId);setZones(rows=>rows.filter(row=>row.id!==targetId));if(editingId===targetId){setZone(blankZone());setEditingId(null);setDrawing(false);}setMessage("Geofence deleted.");}catch(e){setError(e.message);}finally{setBusy(false);}};
  const selectZone=(selectedZone)=>{setZone({name:selectedZone.name,type:selectedZone.type,isActive:selectedZone.isActive,polygon:selectedZone.polygon});setEditingId(selectedZone.id);setDrawing(false);};
  const openGeofenceList=()=>{setShowGeofenceList(true);window.requestAnimationFrame(()=>geofenceTableRef.current?.scrollIntoView({behavior:"smooth",block:"start"}));};
  const mission=missions.find(m=>m.id===missionId);
  const replaySelectionReady = Boolean(missionId && droneId);
  const governmentZones=zones.filter(z=>z.source==="GOVERNMENT");
  const geofenceRows=zones.map(z=>({...z,sourceLabel:z.source==="GOVERNMENT"?(z.provider||"Government"):"DroneOps",pointCount:Array.isArray(z.polygon)?z.polygon.length:0,statusLabel:z.isActive?"Active":"Inactive"}));
  const geofenceColumns=[
    {key:"name",label:"Name"},
    {key:"type",label:"Type",filterable:true,render:z=><span className={`status-pill ${String(z.type).toLowerCase()}`}>{z.type}</span>},
    {key:"statusLabel",label:"Status",filterable:true},
    {key:"sourceLabel",label:"Source",filterable:true},
    {key:"pointCount",label:"Points"},
    {key:"updatedAt",label:"Updated",render:z=>formatDateOnly(z.updatedAt,"-")},
    {key:"actions",label:"Actions",sortable:false,searchable:false,render:z=><div className="table-row-actions"><button type="button" className="secondary-button compact" onClick={()=>selectZone(z)}>Edit</button>{z.source!=="GOVERNMENT"&&<button type="button" className="danger-button compact" disabled={busy} onClick={()=>deleteZone(z.id)}>Delete</button>}</div>}
  ];
  const editingZone=zones.find(z=>z.id===editingId);
  const isGovernmentEditing=editingZone?.source==="GOVERNMENT";
  return <div className="page-stack operations-module">
    <div className="operations-tab-card">
    <div className="operations-tab-list" role="tablist" aria-label="Telemetry and geofence views">
      {[
        ["live","Live tracking","Current aircraft positions",RadioTower],
        ["replay","Replay","Recorded telemetry",RotateCcw],
        ["zones","Geofences","Operational boundaries",ShieldCheck]
      ].map(([id,label,description,Icon])=><button type="button" role="tab" className={tab===id?"active":""} aria-selected={tab===id} key={id} onClick={()=>{setTab(id);setPlaying(false);}}><Icon size={17}/><span><strong>{label}</strong><small>{description}</small></span></button>)}
    </div>
    </div>
    {(error||message)&&<div className="operations-feedback-row">{error&&<div role="alert" className="auth-alert">{error}</div>}{message&&<p role="status" className="operations-success-message">{message}</p>}</div>}
    {tab==="live"&&<GeospatialMap/>}
    {tab==="replay"&&<div className="panel telemetry-replay-panel">
      <div className="operations-toolbar telemetry-replay-toolbar">
        <label className="field">Source<select aria-label="Replay source" value={replaySource} onChange={e=>setReplaySource(e.target.value)}><option value="mission">Mission replay</option><option value="drone">Drone history</option></select></label>
        <label className="field">Mission<select aria-label="Replay mission" value={missionId} onChange={e=>setMissionId(e.target.value)}><option value="">Select mission</option>{missions.map(m=><option value={m.id} key={m.id}>{m.missionCode} - {m.name}</option>)}</select></label>
        <label className="field">Drone<select aria-label="Replay drone" value={droneId} onChange={e=>setDroneId(e.target.value)}><option value="">Select drone</option>{drones.map(d=><option key={d.id} value={d.droneCode ?? d.id}>{d.droneCode}</option>)}</select></label>
        <button className="secondary-button telemetry-refresh-button" type="button" disabled={busy} onClick={()=>setReload(value=>value+1)}><RefreshCw size={16}/>Refresh history</button>
      </div>
      {!busy&&!records.length&&(replaySource==="mission"?missionId:droneId)&&<div className="auth-alert" role="status">{buildReplayEmptyMessage(replaySource, telemetryStatus)}</div>}
      {telemetryStatus&&<TelemetryStatusNote status={telemetryStatus}/>}
      {replaySource==="drone"&&<p className="muted">Latest {records.length} saved packets (up to 2,000). Drone history may include different flights and is not proof of this mission's flight path.</p>}
      {records.length>0&&<p className="muted">{new Date(records[0].timestamp).toLocaleString()} to {new Date(records.at(-1).timestamp).toLocaleString()}</p>}
      <div className="telemetry-replay-map">
        <MissionRouteMap key={`${replaySource}:${missionId}:${droneId}`} showEmptyMap geofences={zones} waypoints={replaySource==="mission"?mission?.plannedRoute?.waypoints??[]:[]} telemetry={records[index]??null} telemetryTrail={records.slice(0,index+1)} telemetryMode="recorded" context={{source:replaySource==="mission"?"Mission replay":"Drone history",mission:replaySource==="mission"?mission?.missionCode:undefined,timestamp:records[index]?.timestamp}}
          mapOverlayControls={replaySelectionReady&&<div className="telemetry-replay-map-controls" aria-label="Replay controls">
            <button type="button" className="icon-button" title={playing?"Pause replay":"Play replay"} aria-label={playing?"Pause replay":"Play replay"} disabled={records.length<2||index>=records.length-1} onClick={()=>setPlaying(p=>!p)}>{playing?<Pause size={16}/>:<Play size={16}/>}</button>
            <button type="button" className="icon-button" title="Restart replay" aria-label="Restart replay" disabled={!records.length} onClick={()=>{setIndex(0);setPlaying(false);}}><RotateCcw size={16}/></button>
            <input aria-label="Replay position" type="range" min="0" max={Math.max(0,records.length-1)} value={index} disabled={!records.length} onChange={e=>{setPlaying(false);setIndex(Number(e.target.value));}}/>
            <span>{records.length?`${index+1} / ${records.length}`:busy?"Loading":"No records"}</span>
          </div>}/>
      </div>
    </div>}
    {tab==="zones"&&<div className="operations-split">
      <div>
        <MissionRouteMap showEmptyMap geofences={[...zones.filter(z=>z.id!==editingId),...(zone.polygon.length>=3?[{...zone,name:zone.name||"Unsaved geofence",isActive:true}]:[])]}
          waypoints={zone.polygon.map(([longitude,latitude],i)=>({longitude,latitude,label:`Boundary point ${i+1}`}))}
          autoFit={false}
          mapOverlayControls={<div className="geofence-map-controls">
            {canManage&&<div className="geofence-draw-control" role="group" aria-label="Geofence drawing controls">
              <button className={drawing?"active":""} type="button" disabled={isGovernmentEditing} onClick={()=>setDrawing(v=>!v)} title={drawing?"Finish boundary":"Draw boundary"} aria-label={drawing?"Finish boundary":"Draw boundary"}><PenLine size={17}/></button>
              <button type="button" className="danger" title="Undo boundary point" aria-label="Undo boundary point" disabled={!zone.polygon.length||isGovernmentEditing} onClick={()=>setZone(z=>({...z,polygon:z.polygon.slice(0,-1)}))}><Undo2 size={17}/></button>
            </div>}
            <span>{zone.polygon.length} boundary points</span>
          </div>}
          onMapClick={drawing&&canManage&&!isGovernmentEditing?point=>setZone(z=>({...z,polygon:[...z.polygon,point]})):undefined}/>
      </div>
      <aside>
        {canManage&&<form className="operations-form" onSubmit={saveZone}>
          <h3>{editingId?isGovernmentEditing?"Government restriction":"Edit manual geofence":"New manual geofence"}</h3>
          {isGovernmentEditing&&<p className="muted">Government restrictions are read-only. Use provider sync to update them.</p>}
          <label className="field">Name<input required maxLength={160} value={zone.name} disabled={isGovernmentEditing} onChange={e=>setZone(z=>({...z,name:e.target.value}))}/></label>
          <label className="field">Type<select value={zone.type} disabled={isGovernmentEditing} onChange={e=>setZone(z=>({...z,type:e.target.value}))}>{["RESTRICTED","WARNING","ADVISORY"].map(v=><option key={v}>{v}</option>)}</select></label>
          <label className="operations-toggle"><input type="checkbox" checked={zone.isActive} disabled={isGovernmentEditing} onChange={e=>setZone(z=>({...z,isActive:e.target.checked}))}/><span><strong>Active</strong><small>Show this zone on operational maps</small></span></label>
          <button className="primary-button" type="submit" disabled={busy||zone.polygon.length<3||isGovernmentEditing}><Save size={16}/>{busy?"Saving...":"Save manual geofence"}</button>
          <button className="secondary-button" type="button" onClick={()=>{setZone(blankZone());setEditingId(null);setDrawing(false);}}>New manual boundary</button>
          {editingId&&!isGovernmentEditing&&<button className="danger-button" type="button" disabled={busy} onClick={()=>deleteZone()}><Trash2 size={16}/>Delete manual geofence</button>}
        </form>}
        <button type="button" className="secondary-button geofence-list-jump" onClick={openGeofenceList}>View geofence list</button>
        <section className="operations-source-card reserved">
          <h3>Government airspace integration</h3>
          <p className="muted">Reserved for CASA/Airservices/FIMS or an approved provider feed. Manual geofences work now.</p>
          <div className="operations-source-stats"><span>{governmentZones.length} synced</span><span>Provider not connected</span></div>
        </section>
      </aside>
    </div>}
    {tab==="zones"&&showGeofenceList&&<section className="panel geofence-list-panel" ref={geofenceTableRef}>
      <div className="panel-heading">
        <div>
          <h3>Geofence List</h3>
          <p>Manual and provider boundaries used by operational maps and mission route checks.</p>
        </div>
        <button type="button" className="secondary-button" onClick={()=>setShowGeofenceList(false)}>Hide list</button>
      </div>
      <DataTable columns={geofenceColumns} rows={geofenceRows} getRowKey={row=>row.id} onRowClick={selectZone} searchPlaceholder="Search geofences" emptyMessage="No geofences saved." tableClassName="geofence-register-table"/>
    </section>}
  </div>;
}

const TelemetryStatusNote=({status})=>{
  if(status.error)return <div className="auth-alert telemetry-status-note" role="status">Telemetry status unavailable: {status.error}</div>;
  const latest=status.latestTelemetry?.timestamp?new Date(status.latestTelemetry.timestamp).toLocaleString():"No packet saved yet";
  const issues=[
    !status.synctegral?.customerKeyConfigured&&"Synctegral customer key is missing.",
    status.connectorDrones===0&&"No drones are configured for a telemetry provider.",
    status.missingExternalDeviceIds?.length>0&&`Missing Vendor Device ID: ${status.missingExternalDeviceIds.join(", ")}.`,
    status.replay?.linkedRecords===0&&"Mission replay is empty until telemetry packets match a mission and assigned drone."
  ].filter(Boolean);
  return <section className="telemetry-status-note" aria-label="Telemetry integration status">
    <strong>Telemetry status</strong>
    <span>Latest saved: {latest}</span>
    <span>Replay records: {status.replay?.linkedRecords??0} mission-linked / {status.replay?.unlinkedRecords??0} drone-only</span>
    {issues.length>0&&<ul>{issues.map(issue=><li key={issue}>{issue}</li>)}</ul>}
  </section>;
};

const buildReplayEmptyMessage=(source,status)=>{
  if(status?.error)return `Replay cannot be checked because telemetry status failed: ${status.error}`;
  if(!status?.synctegral?.customerKeyConfigured)return "No telemetry replay yet. Synctegral is not fully configured because DRONEOPS_CUSTOMER_KEY is missing or still a placeholder.";
  if(status?.connectorDrones===0)return "No telemetry replay yet. Configure at least one drone with a telemetry provider and Vendor Device ID.";
  if(status?.missingExternalDeviceIds?.length)return `No telemetry replay yet. Add Vendor Device ID for ${status.missingExternalDeviceIds.join(", ")}.`;
  if(source==="mission")return "No telemetry is linked to this mission yet. Mission replay requires saved packets whose Synctegral mission ID matches this mission and whose drone ID matches an assigned drone.";
  return "No saved telemetry was found for this drone. Start the connector worker/stream or use refresh while the simulator is publishing packets.";
};
