import { RadioTower, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import ActionButton from "../../../components/common/ActionButton";
import BatteryMeter from "../../../components/common/BatteryMeter";
import CopyableId from "../../../components/common/CopyableId";
import DataTable from "../../../components/common/DataTable";
import SectionHeader from "../../../components/common/SectionHeader";
import StatusBadge from "../../../components/common/StatusBadge";

const FleetOverviewTable = ({ drones, isLoading = false, onDroneSelect }) => {
  const [activeFilter, setActiveFilter] = useState("ALL");
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const filterOptions = [
    { value: "ALL", label: "All drones" },
    { value: "IN_MISSION", label: "In mission" },
    { value: "AVAILABLE", label: "Available" },
    { value: "MAINTENANCE", label: "Maintenance" },
    { value: "OFFLINE", label: "Offline" }
  ];

  const filteredDrones = useMemo(() => {
    if (activeFilter === "ALL") return drones;
    if (activeFilter === "OFFLINE") {
      return drones.filter((drone) => ["DISCONNECTED", "GROUNDED"].includes(drone.status));
    }
    return drones.filter((drone) => drone.status === activeFilter);
  }, [activeFilter, drones]);

  const columns = [
    {
      key: "systemId",
      label: "ID",
      render: (drone) => <CopyableId value={drone.systemId} />
    },
    {
      key: "serialNumber",
      label: "Serial Number",
      render: (drone) => (
        <button className="link-button strong-link" type="button" onClick={() => onDroneSelect?.(drone)}>
          <span>{drone.serialNumber ?? drone.id}</span>
        </button>
      )
    },
    { key: "status", label: "Status", render: (drone) => <StatusBadge>{drone.status}</StatusBadge> },
    { key: "battery", label: "Battery", render: (drone) => <BatteryMeter value={drone.battery} /> },
    {
      key: "signal",
      label: "Signal",
      render: (drone) => (
        <div className="signal"><RadioTower size={15} /><span>{drone.signal}%</span></div>
      )
    },
    { key: "flightHours", label: "Flight Hours" },
    { key: "location", label: "Location" }
  ];

  return (
    <div className="panel fleet-panel">
      <SectionHeader
        title="Drones"
        description="Fleet records across available, in-mission, maintenance, and offline states."
        action={(
          <div className="dashboard-filter-wrap">
            <ActionButton
              icon={SlidersHorizontal}
              onClick={() => setIsFilterOpen((current) => !current)}
            >
              {filterOptions.find((option) => option.value === activeFilter)?.label ?? "Filter"}
            </ActionButton>
            {isFilterOpen && (
              <div className="dashboard-filter-menu" role="menu" aria-label="Drone status filter">
                {filterOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={activeFilter === option.value ? "active" : ""}
                    onClick={() => {
                      setActiveFilter(option.value);
                      setIsFilterOpen(false);
                    }}
                  >
                    <span>{option.label}</span>
                    <strong>{countForFilter(option.value, drones)}</strong>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      />
      <DataTable
        columns={columns}
        rows={filteredDrones}
        getRowKey={(drone) => drone.uuid ?? drone.id}
        onRowClick={onDroneSelect}
        emptyMessage={isLoading ? "Loading fleet records..." : activeFilter === "ALL" ? "No drones found." : "No drones match this filter."}
      />
    </div>
  );
};

const countForFilter = (filter, drones = []) => {
  if (filter === "ALL") return drones.length;
  if (filter === "OFFLINE") return drones.filter((drone) => ["DISCONNECTED", "GROUNDED"].includes(drone.status)).length;
  return drones.filter((drone) => drone.status === filter).length;
};

export default FleetOverviewTable;
