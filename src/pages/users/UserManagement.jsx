import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, Pencil, Save, ShieldCheck, Trash2, UserCheck, Users, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import CopyableId from "../../components/common/CopyableId";
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
  const [editingUserId, setEditingUserId] = useState("");
  const [rowDraft, setRowDraft] = useState({ role: "", isVerified: false });
  const [savingUserId, setSavingUserId] = useState("");
  const [deletingUser, setDeletingUser] = useState(null);
  const [toast, setToast] = useState(null);
  const loadUsers = useCallback(() => droneOpsApi.users.list(), []);
  const { data: apiUsers, error, isLoading, isFallback, refresh, setData } = useApiResource(loadUsers, [], { cacheKey: "users:list", staleMs: 30000 });
  const users = useMemo(() => apiUsers.map((item, index) => normalizeUser(item, index)), [apiUsers]);
  const filteredUsers = useFleetSearch(users, searchValue);
  const routeUserId = useMemo(() => getDetailId(location.pathname, "/users"), [location.pathname]);
  const profileReturnPath = location.state?.returnTo === "/dashboard" ? "/dashboard" : "/users";
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

  const showToast = (nextToast) => {
    setToast(nextToast);
    window.setTimeout(() => setToast(null), 4500);
  };

  const startRowEdit = (targetUser, event) => {
    event.stopPropagation();
    setEditingUserId(targetUser.id);
    setRowDraft({ role: targetUser.role, isVerified: Boolean(targetUser.isVerified) });
  };

  const cancelRowEdit = (event) => {
    event.stopPropagation();
    setEditingUserId("");
    setRowDraft({ role: "", isVerified: false });
  };

  const saveRowEdit = async (targetUser, event) => {
    event.stopPropagation();
    setSavingUserId(targetUser.id);

    try {
      const updatedUser = await droneOpsApi.users.update(targetUser.id, {
        role: apiRoleByRoleId[rowDraft.role] ?? rowDraft.role,
        isVerified: Boolean(rowDraft.isVerified)
      });
      setData((current) => current.map((item) => (item.id === updatedUser.id ? updatedUser : item)));
      refresh();
      setSelectedUser((current) => (current?.id === updatedUser.id ? normalizeUser(updatedUser) : current));
      setEditingUserId("");
      setRowDraft({ role: "", isVerified: false });
      showToast({ type: "success", title: "User updated", message: `${updatedUser.name} access was updated.` });
    } catch (requestError) {
      showToast({ type: "error", title: "User update failed", message: requestError.message });
    } finally {
      setSavingUserId("");
    }
  };

  const requestDeleteUser = (targetUser, event) => {
    event.stopPropagation();
    setDeletingUser(targetUser);
  };

  const confirmDeleteUser = async () => {
    if (!deletingUser) return;
    setSavingUserId(deletingUser.id);

    try {
      await droneOpsApi.users.remove(deletingUser.id);
      setData((current) => current.filter((item) => item.id !== deletingUser.id));
      refresh();
      if (selectedUser?.id === deletingUser.id) navigate(profileReturnPath);
      showToast({ type: "success", title: "User deleted", message: `${deletingUser.name} was removed from the organisation.` });
      setDeletingUser(null);
    } catch (requestError) {
      showToast({ type: "error", title: "User delete failed", message: requestError.message });
    } finally {
      setSavingUserId("");
    }
  };

  const columns = [
    {
      key: "systemId",
      label: "ID",
      render: (row) => <CopyableId value={row.systemId} />
    },
    { key: "serialNumber", label: "Serial Number" },
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
      filterable: true,
      filterValue: (user) => userRoles.find((role) => role.id === user.role)?.label ?? user.role,
      render: (user) => userRoles.find((role) => role.id === user.role)?.label ?? user.role
    },
    { key: "organization", label: "Organization" },
    {
      key: "isVerified",
      label: "Verification",
      filterable: true,
      filterValue: (user) => user.isVerified ? "Verified" : "Awaiting Approval",
      render: (user) => <StatusBadge>{user.isVerified ? "Verified" : "Awaiting Approval"}</StatusBadge>
    },
    {
      key: "actions",
      label: "Actions",
      searchable: false,
      sortable: false,
      render: (row) => {
        const isEditingRow = editingUserId === row.id;
        const isSavingRow = savingUserId === row.id;
        const canDeleteRow = canManageUsers && row.id !== user?.id;

        return (
          <div className="table-actions user-table-actions">
            <button className="icon-button" type="button" onClick={(event) => {
              event.stopPropagation();
              navigate(`/users/${encodeURIComponent(row.id)}`);
            }} aria-label={`View ${row.name}`} title="View profile">
              <Eye size={16} />
            </button>
            {canManageUsers && isEditingRow ? (
              <>
                <select
                  className="table-inline-select"
                  value={rowDraft.role}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => setRowDraft((current) => ({ ...current, role: event.target.value }))}
                  aria-label={`Change role for ${row.name}`}
                >
                  {userRoles.map((role) => (
                    <option key={role.id} value={role.id}>{role.label}</option>
                  ))}
                </select>
                <label className="table-inline-toggle" onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={rowDraft.isVerified}
                    onChange={(event) => setRowDraft((current) => ({ ...current, isVerified: event.target.checked }))}
                  />
                  <span>Verified</span>
                </label>
                <button className="icon-button" type="button" onClick={(event) => saveRowEdit(row, event)} disabled={isSavingRow} aria-label={`Save ${row.name}`} title="Save changes">
                  <Save size={16} />
                </button>
                <button className="icon-button" type="button" onClick={cancelRowEdit} disabled={isSavingRow} aria-label="Cancel row edit" title="Cancel">
                  <X size={16} />
                </button>
              </>
            ) : canManageUsers ? (
              <>
                <button className="icon-button" type="button" onClick={(event) => startRowEdit(row, event)} aria-label={`Edit ${row.name}`} title="Edit role and verification">
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-button danger"
                  type="button"
                  onClick={(event) => requestDeleteUser(row, event)}
                  disabled={!canDeleteRow || isSavingRow}
                  aria-label={`Delete ${row.name}`}
                  title={canDeleteRow ? "Delete user" : "You cannot delete your own active account"}
                >
                  <Trash2 size={16} />
                </button>
              </>
            ) : null}
          </div>
        );
      }
    }
  ];

  return (
    <section className="page-stack">
      {toast && (
        <div className="toast-region" role="status" aria-live="polite">
          <div className={`toast-card ${toast.type === "error" ? "error" : "success"}`}>
            {toast.type === "error" ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
            <div>
              <strong>{toast.title}</strong>
              <p>{toast.message}</p>
            </div>
            <button className="toast-close" type="button" onClick={() => setToast(null)} aria-label="Dismiss notification">
              <X size={16} />
            </button>
          </div>
        </div>
      )}
      {selectedUser && (
        <UserProfileDialog
          user={selectedUser}
          currentUser={user}
          canManage={canManageUsers}
          onUpdated={(updatedUser) => {
            const normalized = normalizeUser(updatedUser);
            setData((current) => current.map((item) => (item.id === updatedUser.id ? updatedUser : item)));
            refresh();
            setSelectedUser(normalized);
          }}
          onDeleted={(deletedUser) => {
            setData((current) => current.filter((item) => item.id !== deletedUser.id));
            refresh();
            navigate(profileReturnPath);
          }}
          onClose={() => navigate(profileReturnPath)}
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
      {deletingUser && createPortal(
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDeletingUser(null)}>
          <div className="delete-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-user-row-title" aria-describedby="delete-user-row-description">
            <div className="delete-confirm-icon">
              <Trash2 size={24} />
            </div>
            <div>
              <h3 id="delete-user-row-title">Delete {deletingUser.name}?</h3>
              <p id="delete-user-row-description">
                This removes the user from this organisation. If the user has linked operational records, update their role or verification status instead.
              </p>
            </div>
            <div className="delete-confirm-actions">
              <button className="secondary-button" type="button" onClick={() => setDeletingUser(null)}>
                Cancel
              </button>
              <button className="danger-button" type="button" onClick={confirmDeleteUser} disabled={savingUserId === deletingUser.id}>
                <Trash2 size={16} />
                Delete User
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
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

const apiRoleByRoleId = {
  operations_manager: "OPERATIONS_MANAGER",
  remote_pilot: "REMOTE_PILOT",
  maintenance_coordinator: "MAINTENANCE_COORDINATOR",
  safety_officer: "SAFETY_OFFICER",
  compliance_officer: "COMPLIANCE_OFFICER",
  system_administrator: "SYSTEM_ADMINISTRATOR"
};

const UserAvatar = ({ user }) => (
  <span className="user-table-avatar">
    {user.profileImageUrl ? <img src={user.profileImageUrl} alt="" /> : getInitials(user.name)}
  </span>
);

const normalizeUser = (user, index = 0) => ({
  ...user,
  systemId: user.id,
  serialNumber: user.userCode ?? `USR-${String(index + 1).padStart(4, "0")}`,
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
