import "server-only";

import { getStoredAdminPassword } from "@/lib/server/db";

export const authCookieName = "account_pool_admin";
const defaultAdminPassword = "Proliant*12";

export function getAdminPassword() {
  return getStoredAdminPassword() || process.env.ADMIN_PASSWORD || defaultAdminPassword;
}

export function getAdminSessionToken() {
  return process.env.ADMIN_SESSION_TOKEN || getAdminPassword();
}
