import "server-only";

export const authCookieName = "account_pool_admin";

export function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || "Yy19971215@";
}

export function getAdminSessionToken() {
  return process.env.ADMIN_SESSION_TOKEN || getAdminPassword();
}
