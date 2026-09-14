import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [replayNotice,setReplayNotice]=useState("");
  const [showGeofenceList,setShowGeofenceList]=useState(false);
  const requestRef=useRef(0);
  const geofenceMapRef=useRef(null);
  const geofenceTableRef=useRef(null);
  const canManage=hasClientPermission(user,"geofences:manage");
  const refreshZones=useCallback(async()=>{if(document.visibilityState!=="visible")return;try{setZones(await droneOpsApi.geofences.list());}catch(e){setError(e.message);}},[]);
  const refreshTelemetryStatus=useCallback(async()=>{if(document.visibilityState!=="visible")return;try{setTelemetryStatus(await droneOpsApi.telemetry.status());}catch(e){setTelemetryStatus({error:e.message});}},[]);
  const selectedDrone=useMemo(()=>drones.find(drone=>droneMatchesIdentifier(drone,droneId))??null,[drones,droneId]);
  const droneMissions=useMemo(()=>droneId?missions.filter(mission=>missionMatchesDrone(mission,selectedDrone,droneId)):[],[missions,selectedDrone,droneId]);
  const filteredMissions=useMemo(()=>droneMissions.filter(missionCanHaveReplay),[droneMissions]);
  const mission=filteredMissions.find(m=>m.id===missionId);
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
    if(!missionId)return;
    if(!filteredMissions.some(mission=>mission.id===missionId))setMissionId("");
  },[filteredMissions,missionId]);
  useEffect(()=>{
    const request=++requestRef.current;setRecords([]);setIndex(0);setPlaying(false);setReplayNotice("");
    if(!droneId||!missionId){setBusy(false);return;}
    setBusy(true);setError("");
    const loadReplay=async()=>{
      if(replaySource==="drone"){
        const droneRows=await droneOpsApi.telemetry.byDrone(droneId,2000);
        const missionScopedDroneRows=filterTelemetryForMission(droneRows,mission);
        if(missionScopedDroneRows.length)return missionScopedDroneRows;
        setReplayNotice("No saved drone-history packets matched the selected mission. Showing the planned mission route only; no drone-history path is confirmed for this mission.");
        return [];
      }
      const missionRows=filterTelemetryForDrone(await droneOpsApi.missions.replay(missionId),selectedDrone,droneId);
      if(missionRows.length)return missionRows;
      const droneRows=await droneOpsApi.telemetry.byDrone(droneId,2000);
      const missionScopedDroneRows=filterTelemetryForMission(droneRows,mission);
      if(missionScopedDroneRows.length){
        setReplayNotice("No mission-linked telemetry was found. Showing selected drone history within this mission context; the route line is planned, not confirmed mission replay evidence.");
      }
      return missionScopedDroneRows;
    };
    loadReplay().then(rows=>{if(request===requestRef.current)setRecords(rows);})
      .catch(e=>{if(request===requestRef.current)setError(e.message);}).finally(()=>{if(request===requestRef.current)setBusy(false);});
    return()=>{requestRef.current=request+1;};
  },[missionId,droneId,replaySource,reload,mission,selectedDrone]);
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
  const selectZone=(selectedZone)=>{setZone({name:selectedZone.name,type:selectedZone.type,isActive:selectedZone.isActive,polygon:selectedZone.polygon});setEditingId(selectedZone.id);setDrawing(false);window.requestAnimationFrame(()=>geofenceMapRef.current?.scrollIntoView({behavior:"smooth",block:"start"}));};
  const openGeofenceList=()=>{setShowGeofenceList(true);window.requestAnimationFrame(()=>geofenceTableRef.current?.scrollIntoView({behavior:"smooth",block:"start"}));};
  const replaySelectionReady = Boolean(droneId&&missionId);
  const canRefreshReplayHistory = replaySelectionReady;
  const governmentZones=zones.filter(z=>z.source==="GOVERNMENT");
  const geofenceRows=zones.map(z=>({...z,sourceLabel:z.source==="GOVERNMENT"?(z.provider||"Government"):"DroneOps",pointCount:Array.isArray(z.polygon)?z.polygon.length:0,statusLabel:z.isActive?"Active":"Inactive"}));
  const geofenceColumns=[
    {key:"name",label:"Name"},
    {key:"type",label:"Type",filterable:true,render:z=><span className={`status-pill ${String(z.type).toLowerCase()}`}>{z.type}</span>},
    {key:"statusLabel",label:"Status",filterable:true},
    {key:"sourceLabel",label:"Source",filterable:true},
    {key:"pointCount",label:"Points"},
    {key:"updatedAt",label:"Updated",render:z=>formatDateOnly(z.updatedAt,"-")},
    {key:"actions",label:"Actions",sortable:false,searchable:false,render:z=><div className="table-row-actions"><button type="button" className="secondary-button compact" onClick={(event)=>{event.stopPropagation();selectZone(z);}}>Edit</button>{z.source!=="GOVERNMENT"&&<button type="button" className="danger-button compact" disabled={busy} onClick={(event)=>{event.stopPropagation();deleteZone(z.id);}}>Delete</button>}</div>}
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
        <label className="field">Drone<select aria-label="Replay drone" value={droneId} onChange={e=>setDroneId(e.target.value)}><option value="">Select drone</option>{drones.map(d=><option key={d.id} value={d.droneCode ?? d.id}>{d.droneCode}</option>)}</select></label>
        <label className="field">Mission<select aria-label="Replay mission" value={missionId} disabled={!droneId||filteredMissions.length===0} onChange={e=>setMissionId(e.target.value)}><option value="">{getReplayMissionPlaceholder({droneId,assignedMissionCount:droneMissions.length,filteredMissionCount:filteredMissions.length})}</option>{filteredMissions.map(m=><option value={m.id} key={m.id}>{m.missionCode} - {m.name}</option>)}</select></label>
        {canRefreshReplayHistory&&<button className="secondary-button telemetry-refresh-button" type="button" disabled={busy} onClick={()=>setReload(value=>value+1)}><RefreshCw size={16}/>Refresh history</button>}
      </div>
      {!busy&&!records.length&&(droneId||missionId)&&<div className="auth-alert" role="status">{buildReplayEmptyMessage(replaySource, telemetryStatus, {missionId,droneId,filteredMissionCount:filteredMissions.length,assignedMissionCount:droneMissions.length})}</div>}
      {replayNotice&&<div className="auth-alert" role="status">{replayNotice}</div>}
      {telemetryStatus&&<TelemetryStatusNote status={telemetryStatus}/>}
      {replaySource==="drone"&&<p className="muted">{busy ? "Loading saved drone history..." : `Showing ${records.length} saved packets confirmed for the selected drone and mission.`}</p>}
      {records.length>0&&<p className="muted">{new Date(records[0].timestamp).toLocaleString()} to {new Date(records.at(-1).timestamp).toLocaleString()}</p>}
      <div className="telemetry-replay-map">
        <MissionRouteMap key={`${replaySource}:${missionId}:${droneId}`} showEmptyMap geofences={zones} waypoints={mission?.plannedRoute?.waypoints??[]} telemetry={records[index]??null} telemetryTrail={records.slice(0,index+1)} telemetryMode="recorded" focusPriority="route" followTelemetry={playing||index>0} showDroneFocusControl context={{source:replaySource==="mission"?"Mission replay":"Drone history",mission:mission?.missionCode,timestamp:records[index]?.timestamp}}
          mapOverlayControls={replaySelectionReady&&<div className="telemetry-replay-map-controls" aria-label="Replay controls">
            <button type="button" className="icon-button" title={playing?"Pause replay":"Play replay"} aria-label={playing?"Pause replay":"Play replay"} disabled={records.length<2||index>=records.length-1} onClick={()=>setPlaying(p=>!p)}>{playing?<Pause size={16}/>:<Play size={16}/>}</button>
            <button type="button" className="icon-button" title="Restart replay" aria-label="Restart replay" disabled={!records.length} onClick={()=>{setIndex(0);setPlaying(false);}}><RotateCcw size={16}/></button>
            <input aria-label="Replay position" type="range" min="0" max={Math.max(0,records.length-1)} value={index} disabled={!records.length} onChange={e=>{setPlaying(false);setIndex(Number(e.target.value));}}/>
            <span>{records.length?`${index+1} / ${records.length}`:busy?"Loading":"No records"}</span>
          </div>}/>
      </div>
    </div>}
    {tab==="zones"&&<div className="operations-split">
      <div ref={geofenceMapRef}>
        <MissionRouteMap showEmptyMap geofences={[...zones.filter(z=>z.id!==editingId),...(zone.polygon.length>=3?[{...zone,name:zone.name||"Unsaved geofence",isActive:true}]:[])]}
          focusedGeofence={editingZone}
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

const buildReplayEmptyMessage=(source,status,{missionId,droneId,filteredMissionCount=0,assignedMissionCount=0}={})=>{
  if(!droneId)return "Select a drone first. Mission choices are filtered to the selected drone.";
  if(droneId&&!missionId&&assignedMissionCount>0&&filteredMissionCount===0)return "This drone has assigned missions, but none have been started yet. Replay is available only for active, completed, or aborted missions.";
  if(droneId&&!missionId)return "Select one of this drone's missions to load replay telemetry.";
  if(status?.error)return `Replay cannot be checked because telemetry status failed: ${status.error}`;
  if(!status?.synctegral?.customerKeyConfigured)return "No telemetry replay yet. Synctegral is not fully configured because DRONEOPS_CUSTOMER_KEY is missing or still a placeholder.";
  if(status?.connectorDrones===0)return "No telemetry replay yet. Configure at least one drone with a telemetry provider and Vendor Device ID.";
  if(status?.missingExternalDeviceIds?.length)return `No telemetry replay yet. Add Vendor Device ID for ${status.missingExternalDeviceIds.join(", ")}.`;
  if(source==="mission")return "No saved telemetry matched this mission and drone. Use Drone history to inspect unlinked packets.";
  return "No saved telemetry was found for this drone. Start the connector worker/stream or use refresh while the simulator is publishing packets.";
};

const getReplayMissionPlaceholder=({droneId,assignedMissionCount,filteredMissionCount})=>{
  if(!droneId)return "Select drone first";
  if(assignedMissionCount>0&&filteredMissionCount===0)return "No started missions";
  if(filteredMissionCount===0)return "No replay missions";
  return "Select mission";
};

const droneMatchesIdentifier=(drone,identifier)=>{
  const target=normalizeToken(identifier);
  if(!target)return false;
  return getDroneIdentifiers(drone).includes(target);
};

const missionMatchesDrone=(mission,drone,droneIdentifier)=>{
  const droneTokens=new Set([normalizeToken(droneIdentifier),...getDroneIdentifiers(drone)].filter(Boolean));
  return getMissionDroneIdentifiers(mission).some(identifier=>droneTokens.has(identifier));
};

const missionCanHaveReplay=(mission)=>["ACTIVE","COMPLETED","ABORTED"].includes(String(mission?.rawStatus??mission?.status??"").toUpperCase());

const filterTelemetryForDrone=(rows,drone,droneIdentifier)=>{
  const droneTokens=new Set([normalizeToken(droneIdentifier),...getDroneIdentifiers(drone)].filter(Boolean));
  if(!droneTokens.size)return [];
  return rows.filter(row=>getTelemetryDroneIdentifiers(row).some(identifier=>droneTokens.has(identifier)));
};

const filterTelemetryForMission=(rows,mission)=>{
  if(!mission)return [];
  const missionRefs=new Set(getMissionIdentifiers(mission));
  const windowRange=getMissionTelemetryWindow(mission);
  return rows.filter(row=>{
    if(getTelemetryMissionIdentifiers(row).some(identifier=>missionRefs.has(identifier)))return true;
    if(!windowRange)return false;
    const timestamp=new Date(row.timestamp).getTime();
    return Number.isFinite(timestamp)&&timestamp>=windowRange.start&&timestamp<=windowRange.end;
  });
};

const getDroneIdentifiers=(drone)=>[
  drone?.id,
  drone?.droneId,
  drone?.droneCode,
  drone?.externalDeviceId,
  drone?.serialNumber
].map(normalizeToken).filter(Boolean);

const getMissionDroneIdentifiers=(mission)=>[
  mission?.droneId,
  mission?.droneCode,
  mission?.externalDeviceId,
  mission?.drone?.id,
  mission?.drone?.droneCode,
  mission?.drone?.externalDeviceId,
  ...(mission?.droneIds??[]),
  ...(mission?.droneCodes??[]),
  ...(mission?.assignedDroneIds??[]),
  ...(mission?.assignedDroneCodes??[]),
  ...(mission?.drones??[]).flatMap(drone=>[
    drone?.id,
    drone?.droneId,
    drone?.droneCode,
    drone?.externalDeviceId,
    drone?.serialNumber
  ]),
  ...(mission?.assignedDrones??[]).flatMap(drone=>[
    drone?.id,
    drone?.droneId,
    drone?.droneCode,
    drone?.externalDeviceId,
    drone?.serialNumber
  ]),
  ...(mission?.droneAssignments??[]).flatMap(assignment=>[
    assignment?.droneId,
    assignment?.droneCode,
    assignment?.drone?.id,
    assignment?.drone?.droneCode,
    assignment?.drone?.externalDeviceId,
    assignment?.drone?.serialNumber
  ])
].map(normalizeToken).filter(Boolean);

const getTelemetryDroneIdentifiers=(row)=>[
  row?.droneId,
  row?.drone?.id,
  row?.drone?.droneCode,
  row?.simulator?.droneId,
  row?.simulator?.raw?.drone_id
].map(normalizeToken).filter(Boolean);

const getMissionIdentifiers=(mission)=>[
  mission?.id,
  mission?.missionCode,
  mission?.synctegralMissionId
].map(normalizeToken).filter(Boolean);

const getTelemetryMissionIdentifiers=(row)=>[
  row?.missionId,
  row?.missionCode,
  row?.simulator?.missionId,
  row?.simulator?.raw?.mission_id
].map(normalizeToken).filter(Boolean);

const getMissionTelemetryWindow=(mission)=>{
  if(!mission?.plannedStartAt||!mission?.plannedEndAt)return null;
  const start=new Date(mission.plannedStartAt).getTime();
  const end=new Date(mission.plannedEndAt).getTime();
  if(!Number.isFinite(start)||!Number.isFinite(end))return null;
  const paddingMs=15*60*1000;
  return {start:start-paddingMs,end:end+paddingMs};
};

const normalizeToken=(value)=>String(value??"").trim();
