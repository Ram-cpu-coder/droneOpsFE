export const canAccessRoute = (user, route) => {
  if (!route?.requiredPermission) return true;
  return hasClientPermission(user, route.requiredPermission);
};

export const firstAccessibleRoute = (user, routes) => {
  return routes.find((route) => canAccessRoute(user, route)) ?? routes[0];
};

export const hasClientPermission = (user, permission) => {
  return Boolean(user?.permissions?.includes("*") || user?.permissions?.includes(permission));
};
