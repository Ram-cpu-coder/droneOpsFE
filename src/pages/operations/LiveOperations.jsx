import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Save, Undo2 } from "lucide-react";
import GeospatialMap from "../../components/maps/GeospatialMap";
import MissionRouteMap from "../missions/components/MissionRouteMap";
import { droneOpsApi } from "../../services/droneOpsApi";
import { getRealtimeSocket } from "../../services/realtimeClient";
import { hasClientPermission } from "../../features/auth/accessControl";

const blankZone=()=>({name:"",type:"WARNING",isActive:true,polygon:[]});
export default function LiveOperations({user}) {
  const [tab,setTab]=useState("live");
  const [zones,setZones]=useState([]);const [missions,setMissions]=useState([]);
  const [missionId,setMissionId]=useState("");const [records,setRecords]=useState([]);
  const [index,setIndex]=useState(0);const [playing,setPlaying]=useState(false);const [speed,setSpeed]=useState(1);
  const [zone,setZone]=useState(blankZone);const [editingId,setEditingId]=useState(null);
  const [drawing,setDrawing]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [message,setMessage]=useState("");
  const requestRef=useRef(0);
  const canManage=hasClientPermission(user,"geofences:manage");
  const refreshZones=useCallback(async()=>{try{setZones(await droneOpsApi.geofences.list());}catch(e){setError(e.message);}},[]);
  useEffect(()=>{
    refreshZones();droneOpsApi.missions.list().then(setMissions).catch(e=>setError(e.message));
    const socket=getRealtimeSocket();socket.on("geofences:changed",refreshZones);
    socket.on("connect",refreshZones);
    const timer=setInterval(refreshZones,15000);
    return()=>{clearInterval(timer);socket.off("geofences:changed",refreshZones);socket.off("connect",refreshZones);};
  },[refreshZones]);
  useEffect(()=>{
    const request=++requestRef.current;setRecords([]);setIndex(0);setPlaying(false);
    if(!missionId)return;
    setBusy(true);setError("");
    droneOpsApi.missions.replay(missionId).then(rows=>{if(request===requestRef.current)setRecords(rows);})
      .catch(e=>{if(request===requestRef.current)setError(e.message);}).finally(()=>{if(request===requestRef.current)setBusy(false);});
    return()=>{requestRef.current++;};
  },[missionId]);
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
  return <div className="operations-page">
    <h2>Live Telemetry & Geofences</h2>
    <div className="operations-tabs" role="tablist" aria-label="Map views">{[["live","Live tracking"],["replay","Replay"],["zones","Geofences"]].map(([id,label])=><button type="button" role="tab" aria-selected={tab===id} key={id} onClick={()=>{setTab(id);setPlaying(false);}}>{label}</button>)}</div>
    {error&&<div role="alert" className="auth-alert">{error}</div>}{message&&<p role="status">{message}</p>}
    {tab==="live"&&<GeospatialMap/>}
    {tab==="replay"&&<>
      <div className="operations-toolbar">
        <label>Mission<select value={missionId} onChange={e=>setMissionId(e.target.value)}><option value="">Select mission</option>{missions.map(m=><option value={m.id} key={m.id}>{m.missionCode} - {m.name}</option>)}</select></label>
        <button type="button" className="icon-button" title={playing?"Pause replay":"Play replay"} aria-label={playing?"Pause replay":"Play replay"} disabled={records.length<2||index>=records.length-1} onClick={()=>setPlaying(p=>!p)}>{playing?<Pause size={18}/>:<Play size={18}/>}</button>
        <button type="button" className="icon-button" title="Restart replay" aria-label="Restart replay" onClick={()=>{setIndex(0);setPlaying(false);}}><RotateCcw size={18}/></button>
        <label>Records per second<select value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[1,2,5,10].map(v=><option key={v}>{v}</option>)}</select></label>
        <input aria-label="Replay position" type="range" min="0" max={Math.max(0,records.length-1)} value={index} disabled={!records.length} onChange={e=>{setPlaying(false);setIndex(Number(e.target.value));}}/>
        <span>{records.length?`${index+1} / ${records.length}`:busy?"Loading telemetry...":"No recorded telemetry"}</span>
      </div>
      <MissionRouteMap key={missionId} showEmptyMap geofences={zones} waypoints={mission?.plannedRoute?.waypoints??[]} telemetry={records[index]??null} telemetryTrail={records.slice(0,index+1)} telemetryMode="recorded" context={{mission:mission?.missionCode,timestamp:records[index]?.timestamp}}/>
    </>}
    {tab==="zones"&&<div className="operations-split">
      <div>
        <MissionRouteMap showEmptyMap geofences={[...zones.filter(z=>z.id!==editingId),...(zone.polygon.length>=3?[{...zone,name:zone.name||"Unsaved geofence",isActive:true}]:[])]}
          waypoints={zone.polygon.map(([longitude,latitude],i)=>({longitude,latitude,label:`Boundary point ${i+1}`}))}
          onMapClick={drawing&&canManage?point=>setZone(z=>({...z,polygon:[...z.polygon,point]})):undefined}/>
        <div className="operations-toolbar">{canManage&&<><button type="button" onClick={()=>setDrawing(v=>!v)}>{drawing?"Finish boundary":"Draw boundary"}</button><button type="button" className="icon-button" title="Undo boundary point" aria-label="Undo boundary point" disabled={!zone.polygon.length} onClick={()=>setZone(z=>({...z,polygon:z.polygon.slice(0,-1)}))}><Undo2 size={18}/></button></>}<span>{zone.polygon.length} boundary points</span></div>
      </div>
      <aside>
        {canManage&&<form className="operations-form" onSubmit={saveZone}>
          <h3>{editingId?"Edit geofence":"New geofence"}</h3>
          <label>Name<input required maxLength={160} value={zone.name} onChange={e=>setZone(z=>({...z,name:e.target.value}))}/></label>
          <label>Type<select value={zone.type} onChange={e=>setZone(z=>({...z,type:e.target.value}))}>{["RESTRICTED","WARNING","ADVISORY"].map(v=><option key={v}>{v}</option>)}</select></label>
          <label><input type="checkbox" checked={zone.isActive} onChange={e=>setZone(z=>({...z,isActive:e.target.checked}))}/> Active</label>
          <button className="primary-button" type="submit" disabled={busy||zone.polygon.length<3}><Save size={16}/>{busy?"Saving...":"Save geofence"}</button>
          <button type="button" onClick={()=>{setZone(blankZone());setEditingId(null);setDrawing(false);}}>New boundary</button>
        </form>}
        <h3>Operational geofences</h3>
        {!zones.length&&<p>No geofences saved.</p>}
        {zones.map(z=><button className="operations-list-item" key={z.id} type="button" onClick={()=>{setZone({name:z.name,type:z.type,isActive:z.isActive,polygon:z.polygon});setEditingId(z.id);setDrawing(false);}}><strong>{z.name}</strong><span>{z.type} · {z.isActive?"Active":"Inactive"}</span></button>)}
      </aside>
    </div>}
  </div>;
}
