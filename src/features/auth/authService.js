import { apiClient, clearAccessToken, SESSION_KEY, setAccessToken } from "../../services/apiClient";
import { userRoles } from "../../data/authData";
import { clearApiResourceCache } from "../../hooks/useApiResource";

const roleIdByApiRole = {
    OPERATIONS_MANAGER: "operations_manager",
    REMOTE_PILOT: "remote_pilot",
    MAINTENANCE_COORDINATOR: "maintenance_coordinator",
    SAFETY_OFFICER: "safety_officer",
    COMPLIANCE_OFFICER: "compliance_officer",
    SYSTEM_ADMINISTRATOR: "system_administrator",
};

const apiRoleByRoleId = {};
let restoreSessionRequest = null;

Object.entries(roleIdByApiRole).forEach(([apiRole, roleId]) => {
    apiRoleByRoleId[roleId] = apiRole;
});

const decorateUser = (user) => {
    let roleId;

    if (roleIdByApiRole[user.role]) {
        roleId = roleIdByApiRole[user.role];
    } else {
        roleId = user.role;
    }

    const role = userRoles.find((item) => {
        return item.id === roleId;
    });

    let roleLabel;
    let permissions;

    if (role) {
        roleLabel = role.label;
        permissions = role.permissions;
    } else {
        roleLabel = user.role;
        permissions = [];
    }

    let organizationName;

    if (user.organisation && user.organisation.name) {
        organizationName = user.organisation.name;
    } else if (user.organization) {
        organizationName = user.organization;
    } else {
        organizationName = "DroneOps";
    }

    return {
        ...user,
        role: roleId,
        roleLabel: roleLabel,
        permissions: permissions,
        organization: organizationName,
    };
};

const persistSession = (session) => {
    const safeSession = { ...session };
    setAccessToken(safeSession.accessToken ?? "");
    delete safeSession.accessToken;
    delete safeSession.refreshToken;
    const sessionText = JSON.stringify(safeSession);

    localStorage.setItem(SESSION_KEY, sessionText);

    return safeSession;
};

const toPersistableUser = (user = {}) => {
    const persistableUser = { ...user };

    delete persistableUser.emailChangePending;

    return persistableUser;
};

const clearSession = () => {
    localStorage.removeItem(SESSION_KEY);
    clearAccessToken();
    clearApiResourceCache();
};

const wait = (delay) => {
    return new Promise((resolve) => {
        window.setTimeout(resolve, delay);
    });
};

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
    hasStoredSession() {
        const storedSession = localStorage.getItem(SESSION_KEY);

        if (storedSession) {
            return true;
        }

        return false;
    },

    getSession() {
        const rawSession = localStorage.getItem(SESSION_KEY);

        if (!rawSession) {
            return null;
        }

        try {
            const session = JSON.parse(rawSession);
            const safeSession = { ...session };
            const hadSensitiveToken = Boolean(safeSession.accessToken || safeSession.refreshToken);
            delete safeSession.accessToken;
            delete safeSession.refreshToken;

            if (hadSensitiveToken) {
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

    async restoreSession() {
        if (restoreSessionRequest) {
            return restoreSessionRequest;
        }

        const rawSession = localStorage.getItem(SESSION_KEY);

        if (!rawSession) {
            return null;
        }

        restoreSessionRequest = (async () => {
            const session = JSON.parse(rawSession);

            let result;

            try {
                result = await apiClient.post("/auth/refresh-token", {});
            } catch (error) {
                const shouldRetry = isTransientNetworkError(error);

                if (!shouldRetry) {
                    throw error;
                }

                await wait(1400);

                result = await apiClient.post("/auth/refresh-token", {});
            }

            const newSession = {
                accessToken: result.accessToken,
                user: decorateUser(result.user || session.user),
            };

            return persistSession(newSession);
        })();

        try {
            return await restoreSessionRequest;
        } catch {
            clearSession();
            return null;
        } finally {
            restoreSessionRequest = null;
        }
    },

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

    async loginWithGoogle(credential) {
        const result = await apiClient.post("/auth/google", {
            credential: credential,
        });

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

    async verifyEmail(token) {
        const result = await apiClient.get(`/auth/verify/${token}?format=json`);

        return result;
    },

    async resendVerificationEmail(email) {
        const result = await apiClient.post("/auth/resend-verification", {
            email: email,
        });

        return {
            emailSent: result.emailSent,
            emailError: result.emailError,
            devVerificationToken: result.devVerificationToken,
            alreadyVerified: result.alreadyVerified,
            user: result.user ? decorateUser(result.user) : { email },
        };
    },

    async requestPasswordReset(email) {
        const result = await apiClient.post("/auth/forgot-password", {
            email: email,
        });

        return result;
    },

    async uploadProfileImage(file) {
        const formData = new FormData();

        formData.append("file", file);

        const result = await apiClient.upload("/auth/profile-image", formData);

        return result;
    },

    async logout() {
        try {
            await apiClient.post("/auth/logout", {});
        } finally {
            clearSession();
        }
    },
};
