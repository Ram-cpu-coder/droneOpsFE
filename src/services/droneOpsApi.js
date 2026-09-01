import { apiClient } from "./apiClient";

export const droneOpsApi = {
  dashboard: {
    overview: () => apiClient.get("/dashboard/overview")
  },
  drones: {
    list: () => apiClient.get("/drones"),
    catalog: (params = {}) => {
      const query = new URLSearchParams(
        Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "")
      ).toString();
      return apiClient.get(`/drones/catalog${query ? `?${query}` : ""}`);
    },
    createCatalogModel: (payload) => apiClient.post("/drones/catalog", payload),
    updateCatalogModel: (id, payload) => apiClient.put(`/drones/catalog/${id}`, payload),
    removeCatalogModel: (id) => apiClient.delete(`/drones/catalog/${id}`),
    create: (payload) => apiClient.post("/drones", payload),
    update: (id, payload) => apiClient.put(`/drones/${id}`, payload),
    remove: (id) => apiClient.delete(`/drones/${id}`)
  },
  missions: {
    list: () => apiClient.get("/missions"),
    create: (payload) => apiClient.post("/missions", payload),
    update: (id, payload) => apiClient.put(`/missions/${id}`, payload),
    approve: (id) => apiClient.post(`/missions/${id}/approve`, {}),
    saveRiskAssessment: (id, payload) => apiClient.post(`/missions/${id}/risk-assessment`, payload),
    start: (id) => apiClient.post(`/missions/${id}/start`, {}),
    complete: (id) => apiClient.post(`/missions/${id}/complete`, {}),
    replay: (id) => apiClient.get(`/missions/${id}/replay`)
  },
  telemetry: {
    live: () => apiClient.get("/telemetry/live"),
    byDrone: (droneId) => apiClient.get(`/telemetry/${droneId}`),
    ingest: (payload) => apiClient.post("/telemetry", payload),
    syncSynctegral: () => apiClient.post("/telemetry/synctegral/sync", {})
  },
  incidents: {
    list: () => apiClient.get("/incidents"),
    create: (payload) => apiClient.post("/incidents", payload),
    update: (id, payload) => apiClient.put(`/incidents/${id}`, payload),
    evidence: (id) => apiClient.get(`/incidents/${id}/evidence`),
    uploadEvidence: (id, formData) => apiClient.upload(`/incidents/${id}/evidence`, formData),
    remove: (id) => apiClient.delete(`/incidents/${id}`)
  },
  maintenance: {
    list: () => apiClient.get("/maintenance"),
    create: (payload) => apiClient.post("/maintenance", payload),
    update: (id, payload) => apiClient.put(`/maintenance/${id}`, payload)
  },
  documents: {
    list: (params = "") => apiClient.get(`/documents${params}`),
    create: (payload) => apiClient.post("/documents", payload),
    upload: (formData) => apiClient.upload("/documents/upload", formData)
  },
  reports: {
    list: () => apiClient.get("/reports"),
    summary: () => apiClient.get("/reports/summary"),
    create: (payload) => apiClient.post("/reports", payload),
    previewGenerate: (payload) => apiClient.post("/reports/generate/preview", payload),
    generate: (payload) => apiClient.post("/reports/generate", payload),
    updateStatus: (id, status) => apiClient.put(`/reports/${id}/status`, { status }),
    remove: (id) => apiClient.delete(`/reports/${id}`)
  },
  geofences: {
    list: () => apiClient.get("/geofences"),
    create: (payload) => apiClient.post("/geofences", payload)
  },
  users: {
    list: () => apiClient.get("/users"),
    updateMe: (payload) => apiClient.put("/users/me", payload),
    update: (id, payload) => apiClient.put(`/users/${id}`, payload),
    remove: (id) => apiClient.delete(`/users/${id}`)
  },
  settings: {
    organisation: () => apiClient.get("/settings/organisation"),
    updateOrganisation: (payload) => apiClient.put("/settings/organisation", payload),
    regenerateOrganisationJoinCode: () => apiClient.post("/settings/organisation/join-code/regenerate", {}),
    alertThresholds: () => apiClient.get("/settings/alert-thresholds"),
    updateAlertThresholds: (payload) => apiClient.put("/settings/alert-thresholds", payload)
  },
  audit: {
    list: (params = {}) => {
      const query = new URLSearchParams(
        Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "")
      ).toString();
      return apiClient.get(`/audit${query ? `?${query}` : ""}`);
    }
  },
  notifications: {
    list: (params = {}) => {
      const query = new URLSearchParams(
        Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "")
      ).toString();
      return apiClient.get(`/notifications${query ? `?${query}` : ""}`);
    },
    markRead: (auditLogIds = []) => apiClient.post("/notifications/read", { auditLogIds }),
    markAllRead: () => apiClient.post("/notifications/read-all", {})
  }
};
