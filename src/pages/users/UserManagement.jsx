import { useCallback, useEffect, useMemo, useState } from "react";
import { ShieldCheck, UserCheck, Users } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import DataTable from "../../components/common/DataTable";
import MetricCard from "../../components/common/MetricCard";
import SectionHeader from "../../components/common/SectionHeader";
import StatusBadge from "../../components/common/StatusBadge";
import { userRoles } from "../../data/authData";
import { useApiResource } from "../../hooks/useApiResource";
import { useFleetSearch } from "../../hooks/useFleetSearch";
import { droneOpsApi } from "../../services/droneOpsApi";
import UserProfileDialog from "./components/UserProfileDialog";

const UserManagement = ({ user, searchValue = "" }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedUser, setSelectedUser] = useState(null);
  const loadUsers = useCallback(() => droneOpsApi.users.list(), []);
  const { data: apiUsers, error, isLoading, isFallback, setData } = useApiResource(loadUsers, []);
  const users = useMemo(() => apiUsers.map(normalizeUser), [apiUsers]);
  const filteredUsers = useFleetSearch(users, searchValue);
  const routeUserId = useMemo(() => getDetailId(location.pathname, "/users"), [location.pathname]);
  const metricUsers = isFallback ? [] : users;
  const verifiedUsers = metricUsers.filter((user) => user.isVerified).length;
  const canManageUsers = isSystemAdministrator(user);

  useEffect(() => {
    if (!routeUserId) {
      setSelectedUser(null);
      return;
    }

    const matchedUser = users.find((item) => String(item.id) === routeUserId);
    setSelectedUser(matchedUser ?? null);
  }, [routeUserId, users]);

  const columns = [
    {
      key: "name",
      label: "User",
      render: (row) => (
        <div className="user-cell">
          <UserAvatar user={row} />
          <strong>{row.name}</strong>
        </div>
      )
    },
    { key: "email", label: "Email" },
    {
      key: "role",
      label: "Role",
      render: (user) => userRoles.find((role) => role.id === user.role)?.label ?? user.role
    },
    { key: "organization", label: "Organization" },
    {
      key: "isVerified",
      label: "Verification",
      render: (user) => <StatusBadge>{user.isVerified ? "Verified" : "Awaiting Approval"}</StatusBadge>
    }
  ];

  return (
    <section className="page-stack">
      {selectedUser && (
        <UserProfileDialog
          user={selectedUser}
          currentUser={user}
          canManage={canManageUsers}
          onUpdated={(updatedUser) => {
            const normalized = normalizeUser(updatedUser);
            setData((current) => current.map((item) => (item.id === updatedUser.id ? updatedUser : item)));
            setSelectedUser(normalized);
          }}
          onDeleted={(deletedUser) => {
            setData((current) => current.filter((item) => item.id !== deletedUser.id));
            navigate("/users");
          }}
          onClose={() => navigate("/users")}
        />
      )}
      <div className="stats-grid three">
        <MetricCard label="Users" value={isLoading ? "..." : metricUsers.length} delta={isFallback ? "Backend unavailable" : "Current organisation directory"} icon={Users} tone="blue" />
        <MetricCard label="Verified" value={isLoading ? "..." : verifiedUsers} delta="Allowed portal access" icon={UserCheck} tone="green" />
        <MetricCard label="Roles" value={userRoles.length} delta="Configured access roles" icon={ShieldCheck} tone="purple" />
      </div>
      {error && <div className="auth-alert">Backend unavailable: user directory could not be loaded. {error}</div>}
      <div className="panel">
        <SectionHeader
          title="User Management"
          description="Organisation-scoped user directory with role and verification status."
        />
        <DataTable
          columns={columns}
          rows={filteredUsers}
          getRowKey={(user) => user.id}
          onRowClick={(row) => navigate(`/users/${encodeURIComponent(row.id)}`)}
          emptyMessage={isLoading ? "Loading users..." : "No users found."}
        />
      </div>
    </section>
  );
};

const roleIdByApiRole = {
  OPERATIONS_MANAGER: "operations_manager",
  REMOTE_PILOT: "remote_pilot",
  MAINTENANCE_COORDINATOR: "maintenance_coordinator",
  SAFETY_OFFICER: "safety_officer",
  COMPLIANCE_OFFICER: "compliance_officer",
  SYSTEM_ADMINISTRATOR: "system_administrator"
};

const UserAvatar = ({ user }) => (
  <span className="user-table-avatar">
    {user.profileImageUrl ? <img src={user.profileImageUrl} alt="" /> : getInitials(user.name)}
  </span>
);

const normalizeUser = (user) => ({
  ...user,
  role: roleIdByApiRole[user.role] ?? user.role,
  organization: user.organisation?.name ?? user.organization ?? "DroneOps"
});

const isSystemAdministrator = (user) => {
  const role = user?.role?.toString().toUpperCase();
  return role === "SYSTEM_ADMINISTRATOR" || user?.role === "system_administrator";
};

const getInitials = (name = "") => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
};

const getDetailId = (pathname, basePath) => {
  if (!pathname.startsWith(`${basePath}/`)) return "";
  return decodeURIComponent(pathname.slice(basePath.length + 1).split("/")[0] ?? "");
};

export default UserManagement;
