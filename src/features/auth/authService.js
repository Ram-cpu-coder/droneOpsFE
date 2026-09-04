import { apiClient, SESSION_KEY } from "../../services/apiClient";
import { userRoles } from "../../data/authData";
import { clearApiResourceCache } from "../../hooks/useApiResource";

/*
  Backend sends roles like:
  OPERATIONS_MANAGER

  Frontend uses roles like:
  operations_manager

  This object converts backend role names to frontend role IDs.
*/
const roleIdByApiRole = {
    OPERATIONS_MANAGER: "operations_manager",
    REMOTE_PILOT: "remote_pilot",
    MAINTENANCE_COORDINATOR: "maintenance_coordinator",
    SAFETY_OFFICER: "safety_officer",
    COMPLIANCE_OFFICER: "compliance_officer",
    SYSTEM_ADMINISTRATOR: "system_administrator",
};

/*
  This creates the opposite conversion.

  From:
  operations_manager

  To:
  OPERATIONS_MANAGER

  This is needed when sending role data back to the backend.
*/
const apiRoleByRoleId = {};

Object.entries(roleIdByApiRole).forEach(([apiRole, roleId]) => {
    apiRoleByRoleId[roleId] = apiRole;
});

/*
  This prepares the user object for frontend use.

  It adds:
  - frontend role ID
  - readable role label
  - permissions for UI access
  - organization name
*/
const decorateUser = (user) => {
    let roleId;

    // Convert backend role to frontend role if possible.
    if (roleIdByApiRole[user.role]) {
        roleId = roleIdByApiRole[user.role];
    } else {
        roleId = user.role;
    }

    // Find this role from frontend role list.
    const role = userRoles.find((item) => {
        return item.id === roleId;
    });

    let roleLabel;
    let permissions;

    // If role exists, use its label and permissions.
    if (role) {
        roleLabel = role.label;
        permissions = role.permissions;
    } else {
        roleLabel = user.role;
        permissions = [];
    }

    let organizationName;

    // Backend may send "organisation" or frontend may already have "organization".
    if (user.organisation && user.organisation.name) {
        organizationName = user.organisation.name;
    } else if (user.organization) {
        organizationName = user.organization;
    } else {
        organizationName = "DroneOps";
    }

    // Return original user plus extra frontend-friendly fields.
    return {
        ...user,
        role: roleId,
        roleLabel: roleLabel,
        permissions: permissions,
        organization: organizationName,
    };
};

/*
  Save the session in browser localStorage.

  Session contains:
  - accessToken
  - user
*/
const persistSession = (session) => {
    const safeSession = { ...session };
    delete safeSession.refreshToken;
    const sessionText = JSON.stringify(safeSession);

    localStorage.setItem(SESSION_KEY, sessionText);

    return safeSession;
};

/*
  Remove temporary user fields before saving user in localStorage.

  emailChangePending should not stay forever in browser storage.
*/
const toPersistableUser = (user = {}) => {
    const persistableUser = { ...user };

    delete persistableUser.emailChangePending;

    return persistableUser;
};

/*
  Remove saved login session from browser.
*/
const clearSession = () => {
    localStorage.removeItem(SESSION_KEY);
    clearApiResourceCache();
};

/*
  Wait for a given time.

  Used before retrying a failed network request.
*/
const wait = (delay) => {
    return new Promise((resolve) => {
        window.setTimeout(resolve, delay);
    });
};

/*
  Check if the error is probably temporary.

  Example:
  - internet issue
  - backend took time to wake up
  - request failed once
*/
const isTransientNetworkError = (error) => {
    let message = "";

    if (error && error.message) {
        message = error.message.toLowerCase();
    }

    if (message.includes("failed to fetch")) {
        return true;
    }

    if (message.includes("networkerror")) {
        return true;
    }

    if (message.includes("load failed")) {
        return true;
    }

    return false;
};

export const authService = {
    /*
      Check if browser has a saved session.
    */
    hasStoredSession() {
        const storedSession = localStorage.getItem(SESSION_KEY);

        if (storedSession) {
            return true;
        }

        return false;
    },

    /*
      Get saved session from localStorage.
  
      If session exists:
      - parse it
      - decorate user
      - return session
  
      If session is broken:
      - clear it
      - return null
    */
    getSession() {
        const rawSession = localStorage.getItem(SESSION_KEY);

        if (!rawSession) {
            return null;
        }

        try {
            const session = JSON.parse(rawSession);
            const safeSession = { ...session };
            const hadRefreshToken = Boolean(safeSession.refreshToken);
            delete safeSession.refreshToken;

            if (hadRefreshToken) {
                localStorage.setItem(SESSION_KEY, JSON.stringify(safeSession));
            }

            if (!safeSession.user) {
                return null;
            }

            const decoratedUser = decorateUser(safeSession.user);

            return {
                ...safeSession,
                user: decoratedUser,
            };
        } catch {
            clearSession();
            return null;
        }
    },

    /*
      Restore user session when app starts.
  
      It uses the HttpOnly refresh cookie to get a new access token.
    */
    async restoreSession() {
        const rawSession = localStorage.getItem(SESSION_KEY);

        if (!rawSession) {
            return null;
        }

        try {
            const session = JSON.parse(rawSession);

            let result;

            try {
                result = await apiClient.post("/auth/refresh-token", {});
            } catch (error) {
                const shouldRetry = isTransientNetworkError(error);

                // If it is not a temporary network issue, stop and fail.
                if (!shouldRetry) {
                    throw error;
                }

                // Wait shortly and try one more time.
                await wait(1400);

                result = await apiClient.post("/auth/refresh-token", {});
            }

            // Save the refreshed session.
            const newSession = {
                accessToken: result.accessToken,
                user: decorateUser(result.user || session.user),
            };

            return persistSession(newSession);
        } catch {
            clearSession();
            return null;
        }
    },

    /*
      Update only the stored user data inside the current session.
    */
    updateStoredUser(user) {
        const session = this.getSession();

        if (!session) {
            return null;
        }

        const persistableUser = toPersistableUser(user);

        const updatedUser = {
            ...session.user,
            ...persistableUser,
        };

        const updatedSession = {
            ...session,
            user: decorateUser(updatedUser),
        };

        return persistSession(updatedSession);
    },

    /*
      Login with email and password.
    */
    async login({ email, password }) {
        const result = await apiClient.post("/auth/login", {
            email: email,
            password: password,
        });

        const session = {
            accessToken: result.accessToken,
            user: decorateUser(result.user),
        };

        return persistSession(session);
    },

    /*
      Login using Google credential.
    */
    async loginWithGoogle(credential) {
        const result = await apiClient.post("/auth/google", {
            credential: credential,
        });

        // New Google users must complete profile first.
        if (result.needsOnboarding) {
            return {
                needsOnboarding: true,
                credential: credential,
                googleProfile: result.googleProfile,
            };
        }

        const session = {
            accessToken: result.accessToken,
            user: decorateUser(result.user),
        };

        return persistSession(session);
    },

    /*
      Complete profile setup for new Google users.
    */
    async completeGoogleProfile(payload) {
        let apiRole;
        const organisationMode = payload.organizationMode === "create" ? "create" : "join";

        if (apiRoleByRoleId[payload.role]) {
            apiRole = apiRoleByRoleId[payload.role];
        } else {
            apiRole = "OPERATIONS_MANAGER";
        }

        const result = await apiClient.post("/auth/google/complete-profile", {
            credential: payload.credential,
            organisationMode,
            organisationJoinCode: organisationMode === "create" ? undefined : payload.organizationCode || undefined,
            organisationName: organisationMode === "create" ? payload.organizationName || undefined : undefined,
            industry: payload.industry || undefined,
            role: apiRole,
        });

        const session = {
            accessToken: result.accessToken,
            user: decorateUser(result.user),
        };

        return persistSession(session);
    },

    /*
      Create a new account.
  
      Signup does not directly log in the user.
      User must verify email first.
    */
    async signup(payload) {
        let apiRole;

        if (apiRoleByRoleId[payload.role]) {
            apiRole = apiRoleByRoleId[payload.role];
        } else {
            apiRole = "OPERATIONS_MANAGER";
        }

        let profileImageUrl;

        if (payload.profileImageUrl) {
            profileImageUrl = payload.profileImageUrl;
        } else {
            profileImageUrl = undefined;
        }

        const result = await apiClient.post("/auth/signup", {
            name: payload.name,
            email: payload.email,
            password: payload.password,
            organisationMode: payload.organizationMode || "join",
            organisationJoinCode: payload.organizationMode === "create" ? undefined : payload.organizationCode || undefined,
            organisationName: payload.organizationMode === "create" ? payload.organizationName || undefined : undefined,
            industry: payload.industry,
            profileImageUrl: profileImageUrl,
            role: apiRole,
        });

        return {
            emailSent: result.emailSent,
            emailError: result.emailError,
            devVerificationToken: result.devVerificationToken,
            user: decorateUser(result.user),
        };
    },

    async resolveOrganisationCode(organizationCode) {
        return apiClient.post("/auth/organisation/resolve-code", {
            organisationJoinCode: organizationCode,
        });
    },

    /*
      Verify user email using verification token.
    */
    async verifyEmail(token) {
        const result = await apiClient.get(`/auth/verify/${token}?format=json`);

        return result;
    },

    /*
      Request password reset email.
    */
    async requestPasswordReset(email) {
        const result = await apiClient.post("/auth/forgot-password", {
            email: email,
        });

        return result;
    },

    /*
      Upload profile image for an authenticated user profile.
    */
    async uploadProfileImage(file) {
        const formData = new FormData();

        formData.append("file", file);

        const result = await apiClient.upload("/auth/profile-image", formData);

        return result;
    },

    /*
      Logout user.
  
      Even if backend logout fails,
      frontend still clears local session.
    */
    async logout() {
        try {
            await apiClient.post("/auth/logout", {});
        } finally {
            clearSession();
        }
    },
};
