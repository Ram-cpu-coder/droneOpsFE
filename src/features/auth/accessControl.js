export const hasClientPermission = (user, permission) => {
    // If there is no user, they cannot have permission
    if (!user) {
        return false;
    }

    // Get the user's permission list
    const userPermissions = user.permissions;

    // If permissions does not exist, user has no permissions
    if (!userPermissions) {
        return false;
    }

    // "*" means the user has access to everything
    const hasAllPermissions = userPermissions.includes("*");

    if (hasAllPermissions) {
        return true;
    }

    // Check if the user has the specific required permission
    const hasRequiredPermission = userPermissions.includes(permission);

    if (hasRequiredPermission) {
        return true;
    }

    // Otherwise, user does not have permission
    return false;
};

export const canAccessRoute = (user, route) => {
    // If the route does not require any permission,
    // everyone can access it
    if (!route || !route.requiredPermission) {
        return true;
    }

    // Get the permission needed for this route
    const requiredPermission = route.requiredPermission;

    // Check if the user has that permission
    const userHasPermission = hasClientPermission(user, requiredPermission);

    if (userHasPermission) {
        return true;
    }

    return false;
};

export const firstAccessibleRoute = (user, routes) => {
    // Find the first route that this user can access
    const accessibleRoute = routes.find((route) => {
        return canAccessRoute(user, route);
    });

    // If we found an accessible route, return it
    if (accessibleRoute) {
        return accessibleRoute;
    }

    // Otherwise, return the first route in the list as fallback
    return routes[0];
};