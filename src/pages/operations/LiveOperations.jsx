import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Save, Undo2, RefreshCw } from "lucide-react";
import SectionHeader from "../../components/common/SectionHeader";
import ActionButton from "../../components/common/ActionButton";
import GeospatialMap from "../../components/maps/GeospatialMap";
import MissionRouteMap from "../missions/components/MissionRouteMap";
import { droneOpsApi } from "../../services/droneOpsApi";
import { getRealtimeSocket } from "../../services/realtimeClient";
import { hasClientPermission } from "../../features/auth/accessControl";

const blankZone=()=>({name:"",type:"WARNING",isActive:true,polygon:[]});
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
  const [drawing,setDrawing]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [message,setMessage]=useState("");
  const requestRef=useRef(0);
  const canManage=hasClientPermission(user,"geofences:manage");
  const refreshZones=useCallback(async()=>{try{setZones(await droneOpsApi.geofences.list());}catch(e){setError(e.message);}},[]);
  useEffect(()=>{
    refreshZones();droneOpsApi.missions.list().then(setMissions).catch(e=>setError(e.message));
    droneOpsApi.drones.list().then(setDrones).catch(e=>setError(e.message));
    const socket=getRealtimeSocket();socket.on("geofences:changed",refreshZones);
    socket.on("connect",refreshZones);
    const timer=setInterval(refreshZones,15000);
    return()=>{clearInterval(timer);socket.off("geofences:changed",refreshZones);socket.off("connect",refreshZones);};
  },[refreshZones]);
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
      setZones(rows=>[saved,...rows.filter(row=>row.id!==saved.id)]);setEditingId(saved.id);setDrawing(false);setMessage("Geofence saved.");
    }catch(e){setError(e.message);}finally{setBusy(false);}
  };
  const mission=missions.find(m=>m.id===missionId);
  return <div className="page-stack operations-module">
    <div className="panel"><SectionHeader title="Telemetry & Geofences" />
    <div className="mission-profile-tabs" role="tablist" aria-label="Map views">{[["live","Live tracking"],["replay","Replay"],["zones","Geofences"]].map(([id,label])=><button type="button" role="tab" className={tab===id?"active":""} aria-selected={tab===id} key={id} onClick={()=>{setTab(id);setPlaying(false);}}>{label}</button>)}</div>
    </div>
    {error&&<div role="alert" className="auth-alert">{error}</div>}{message&&<p role="status">{message}</p>}
    {tab==="live"&&<GeospatialMap/>}
    {tab==="replay"&&<div className="panel">
      <SectionHeader title="Telemetry Replay" action={<ActionButton icon={RefreshCw} disabled={busy} onClick={()=>setReload(value=>value+1)}>Refresh history</ActionButton>} />
      <div className="operations-toolbar">
        <label className="field">Source<select aria-label="Replay source" value={replaySource} onChange={e=>setReplaySource(e.target.value)}><option value="mission">Mission replay</option><option value="drone">Drone history</option></select></label>
        {replaySource==="mission"?<label className="field">Mission<select aria-label="Replay mission" value={missionId} onChange={e=>setMissionId(e.target.value)}><option value="">Select mission</option>{missions.map(m=><option value={m.id} key={m.id}>{m.missionCode} - {m.name}</option>)}</select></label>:<label className="field">Drone<select aria-label="Replay drone" value={droneId} onChange={e=>setDroneId(e.target.value)}><option value="">Select drone</option>{drones.map(d=><option key={d.id} value={d.id}>{d.droneCode}</option>)}</select></label>}
        <button type="button" className="icon-button" title={playing?"Pause replay":"Play replay"} aria-label={playing?"Pause replay":"Play replay"} disabled={records.length<2||index>=records.length-1} onClick={()=>setPlaying(p=>!p)}>{playing?<Pause size={18}/>:<Play size={18}/>}</button>
        <button type="button" className="icon-button" title="Restart replay" aria-label="Restart replay" onClick={()=>{setIndex(0);setPlaying(false);}}><RotateCcw size={18}/></button>
        <label className="field">Records per second<select value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[1,2,5,10].map(v=><option key={v}>{v}</option>)}</select></label>
        <input aria-label="Replay position" type="range" min="0" max={Math.max(0,records.length-1)} value={index} disabled={!records.length} onChange={e=>{setPlaying(false);setIndex(Number(e.target.value));}}/>
        <span>{records.length?`${index+1} / ${records.length}`:busy?"Loading telemetry...":"No recorded telemetry"}</span>
      </div>
      {!busy&&!records.length&&(replaySource==="mission"?missionId:droneId)&&<div className="auth-alert" role="status">{replaySource==="mission"?"No telemetry is linked to this mission. Drone history may contain separate simulator flights. Mission replay requires matching drone and Synctegral mission IDs.":"No saved telemetry was found for this drone."}</div>}
      {replaySource==="drone"&&<p className="muted">Latest {records.length} saved packets (up to 2,000). Drone history may include different flights and is not proof of this mission's flight path.</p>}
      {records.length>0&&<p className="muted">{new Date(records[0].timestamp).toLocaleString()} to {new Date(records.at(-1).timestamp).toLocaleString()}</p>}
      <MissionRouteMap key={`${replaySource}:${missionId}:${droneId}`} showEmptyMap geofences={zones} waypoints={replaySource==="mission"?mission?.plannedRoute?.waypoints??[]:[]} telemetry={records[index]??null} telemetryTrail={records.slice(0,index+1)} telemetryMode="recorded" context={{source:replaySource==="mission"?"Mission replay":"Drone history",mission:replaySource==="mission"?mission?.missionCode:undefined,timestamp:records[index]?.timestamp}}/>
    </div>}
    {tab==="zones"&&<div className="operations-split">
      <div>
        <MissionRouteMap showEmptyMap geofences={[...zones.filter(z=>z.id!==editingId),...(zone.polygon.length>=3?[{...zone,name:zone.name||"Unsaved geofence",isActive:true}]:[])]}
          waypoints={zone.polygon.map(([longitude,latitude],i)=>({longitude,latitude,label:`Boundary point ${i+1}`}))}
          onMapClick={drawing&&canManage?point=>setZone(z=>({...z,polygon:[...z.polygon,point]})):undefined}/>
        <div className="operations-toolbar">{canManage&&<><button className="secondary-button" type="button" onClick={()=>setDrawing(v=>!v)}>{drawing?"Finish boundary":"Draw boundary"}</button><button type="button" className="icon-button" title="Undo boundary point" aria-label="Undo boundary point" disabled={!zone.polygon.length} onClick={()=>setZone(z=>({...z,polygon:z.polygon.slice(0,-1)}))}><Undo2 size={18}/></button></>}<span>{zone.polygon.length} boundary points</span></div>
      </div>
      <aside>
        {canManage&&<form className="operations-form" onSubmit={saveZone}>
          <h3>{editingId?"Edit geofence":"New geofence"}</h3>
          <label className="field">Name<input required maxLength={160} value={zone.name} onChange={e=>setZone(z=>({...z,name:e.target.value}))}/></label>
          <label className="field">Type<select value={zone.type} onChange={e=>setZone(z=>({...z,type:e.target.value}))}>{["RESTRICTED","WARNING","ADVISORY"].map(v=><option key={v}>{v}</option>)}</select></label>
          <label className="field"><input type="checkbox" checked={zone.isActive} onChange={e=>setZone(z=>({...z,isActive:e.target.checked}))}/> Active</label>
          <button className="primary-button" type="submit" disabled={busy||zone.polygon.length<3}><Save size={16}/>{busy?"Saving...":"Save geofence"}</button>
          <button className="secondary-button" type="button" onClick={()=>{setZone(blankZone());setEditingId(null);setDrawing(false);}}>New boundary</button>
        </form>}
        <h3>Organisation geofences</h3>
        <p className="muted">Source: DroneOps. Live updates reflect your team's changes, not a government airspace feed.</p>
        {!zones.length&&<p>No geofences saved.</p>}
        {zones.map(z=><button className="operations-list-item" key={z.id} type="button" onClick={()=>{setZone({name:z.name,type:z.type,isActive:z.isActive,polygon:z.polygon});setEditingId(z.id);setDrawing(false);}}><strong>{z.name}</strong><span>{z.type} · {z.isActive?"Active":"Inactive"}</span></button>)}
      </aside>
    </div>}
  </div>;
}
