// Backend API base URL.
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5001/api/v1";

// localStorage key for saved session.
const SESSION_KEY = "droneops_session";

// Stores active GET requests to avoid duplicate calls.
const inFlightGetRequests = new Map();

// Reads session from localStorage.
const getSession = () => {
  const rawSession = localStorage.getItem(SESSION_KEY);

  if (!rawSession) return null;

  try {
    return JSON.parse(rawSession);
  } catch {
    // Clear broken session data.
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
};

// Gets access token from saved session.
const getAccessToken = () => {
  return getSession()?.accessToken ?? "";
};

// Checks if request should trigger activity refresh.
const shouldNotifyActivityChange = (method = "GET", path = "") => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())) {
    return false;
  }

  // Auth requests should not refresh activity data.
  const ignoredPaths = [
    "/auth/login",
    "/auth/google",
    "/auth/google/complete-profile",
    "/auth/signup",
    "/auth/refresh-token",
    "/auth/forgot-password",
    "/auth/reset-password",
  ];

  return !ignoredPaths.some((ignoredPath) => path.startsWith(ignoredPath));
};

// Sends browser event after data changes.
const notifyActivityChanged = (path, method) => {
  if (
    typeof window === "undefined" ||
    !shouldNotifyActivityChange(method, path)
  ) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent("droneops:activity-changed", {
      detail: { path, method },
    }),
  );
};

// Converts validation errors into readable text.
const formatValidationDetails = (details) => {
  const fieldErrors = details?.fieldErrors;

  if (!fieldErrors || typeof fieldErrors !== "object") return "";

  return Object.entries(fieldErrors)
    .flatMap(([field, messages]) => {
      if (!Array.isArray(messages) || !messages.length) return [];

      const label = field
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (value) => value.toUpperCase());

      return messages.map((message) => `${label}: ${message}`);
    })
    .join(" ");
};

// Gets new access token using refresh token.
const refreshAccessToken = async () => {
  const session = getSession();

  if (!session?.refreshToken) return null;

  const response = await fetch(`${API_BASE_URL}/auth/refresh-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });

  const payload = await response.json().catch(() => ({}));

  // If refresh fails, force logout.
  if (!response.ok) {
    localStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new Event("droneops:session-expired"));
    return null;
  }

  // Save refreshed session.
  const nextSession = {
    ...session,
    accessToken: payload.data.accessToken,
    refreshToken: payload.data.refreshToken,
    user: payload.data.user ?? session.user,
  };

  localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));

  return nextSession.accessToken;
};

// Main request function used by all API methods.
const request = async (path, options = {}, retry = true) => {
  const headers = new Headers(options.headers);
  const token = getAccessToken();

  // Attach access token if user is logged in.
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // Add JSON header unless sending files.
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  // Send request to backend.
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    body:
      options.body instanceof FormData
        ? options.body
        : options.body
          ? JSON.stringify(options.body)
          : undefined,
  });

  const method = options.method ?? "GET";

  // 204 means success with no response body.
  if (response.status === 204) {
    notifyActivityChanged(path, method);
    return null;
  }

  const payload = await response.json().catch(() => ({}));

  // Handle failed response.
  if (!response.ok) {
    const errorText =
      `${payload.message ?? ""} ${payload.code ?? ""} ${payload.stack ?? ""}`.toLowerCase();

    const isExpiredJwt =
      errorText.includes("jwt expired") ||
      errorText.includes("tokenexpirederror") ||
      payload.code === "JWT_EXPIRED";

    // If token expired, refresh and retry once.
    if (retry && isExpiredJwt) {
      const nextToken = await refreshAccessToken();

      if (nextToken) {
        return request(path, options, false);
      }
    }

    // Show validation errors clearly.
    const validationMessage =
      payload.code === "VALIDATION_ERROR"
        ? formatValidationDetails(payload.details)
        : "";

    throw new Error(
      validationMessage || payload.message || `Request failed: ${response.status}`,
    );
  }

  // Notify app if data changed.
  notifyActivityChanged(path, method);

  // Return response data.
  return payload.data ?? payload;
};

// Builds unique key for GET request cache.
const getRequestKey = (path) => {
  const token = getAccessToken();

  return `${token ? token.slice(-16) : "anonymous"}:${path}`;
};

// GET request with duplicate-call protection.
const get = (path) => {
  const requestKey = getRequestKey(path);
  const existingRequest = inFlightGetRequests.get(requestKey);

  // Return existing request if same GET is already running.
  if (existingRequest) {
    return existingRequest;
  }

  const nextRequest = request(path).finally(() => {
    inFlightGetRequests.delete(requestKey);
  });

  inFlightGetRequests.set(requestKey, nextRequest);

  return nextRequest;
};

// Reusable API methods.
export const apiClient = {
  get,
  post: (path, body) => request(path, { method: "POST", body }),
  put: (path, body) => request(path, { method: "PUT", body }),
  delete: (path) => request(path, { method: "DELETE" }),
  upload: (path, formData) =>
    request(path, { method: "POST", body: formData }),
};

export { API_BASE_URL, SESSION_KEY };