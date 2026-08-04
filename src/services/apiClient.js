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
    const session = JSON.parse(rawSession);

    if (session.refreshToken) {
      const safeSession = { ...session };
      delete safeSession.refreshToken;
      localStorage.setItem(SESSION_KEY, JSON.stringify(safeSession));
      return safeSession;
    }

    return session;
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
    "/notifications/read",
    "/notifications/read-all",
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
  const formErrors = Array.isArray(details?.formErrors) ? details.formErrors : [];

  if (!fieldErrors || typeof fieldErrors !== "object") return formErrors.join(" ");

  const fieldMessages = Object.entries(fieldErrors)
    .flatMap(([field, messages]) => {
      if (!Array.isArray(messages) || !messages.length) return [];

      if (field === "body") return messages;

      const label = field
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (value) => value.toUpperCase());

      return messages.map((message) => `${label}: ${message}`);
    })
    .join(" ");

  return [fieldMessages, ...formErrors].filter(Boolean).join(" ");
};

// Gets a new access token using the HttpOnly refresh cookie.
const refreshAccessToken = async () => {
  const session = getSession();

  if (!session) return null;

  const response = await fetch(`${API_BASE_URL}/auth/refresh-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({}),
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
    user: payload.data.user ?? session.user,
  };

  localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));

  return nextSession.accessToken;
};

// Main request function used by all API methods.
const request = async (path, options = {}, retry = true) => {
  const headers = new Headers(options.headers);
  const token = getAccessToken();
  const method = (options.method ?? "GET").toUpperCase();
  const hasRequestBody = Object.prototype.hasOwnProperty.call(options, "body");
  const shouldSendJsonBody = method !== "GET" && method !== "HEAD" && !(options.body instanceof FormData);

  // Attach access token if user is logged in.
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // Add JSON header unless sending files.
  if (shouldSendJsonBody) {
    headers.set("Content-Type", "application/json");
  }

  // Send request to backend.
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    cache: "no-store",
    credentials: "include",
    body:
      options.body instanceof FormData
        ? options.body
        : shouldSendJsonBody
          ? JSON.stringify(hasRequestBody ? options.body : {})
          : undefined,
  });

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
