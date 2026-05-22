import "server-only";

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID, createHash } from "node:crypto";
import type {
  AccountRecord,
  AccountStatus,
  AccountViewModel,
  ActivityLogRecord,
  AutoReplenishRuleInput,
  AutoReplenishRuleRecord,
  AutoReplenishRunRecord,
  AutoReplenishRunStatus,
  DashboardData,
  DashboardSummary,
  IntegrationInput,
  IntegrationRecord,
  IntegrationViewModel,
  ManualAccountInput,
  RemoteStatusSummary,
} from "@/lib/types";

type RemoteAccount = {
  remoteId?: string | null;
  email?: string | null;
  label?: string | null;
  accountId?: string | null;
  userId?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  planType?: string | null;
  status?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
};

const dataDir = join(process.cwd(), "data");
const dbFile = join(dataDir, "account-pool.sqlite");

mkdirSync(dirname(dbFile), { recursive: true });

let database: DatabaseSync | null = null;

function getDb() {
  if (database) return database;

  const db = new DatabaseSync(dbFile);
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS integrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      base_url TEXT NOT NULL,
      auth_mode TEXT NOT NULL,
      auth_value TEXT,
      auth_header_name TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      last_test_status TEXT,
      last_test_message TEXT,
      last_synced_at TEXT,
      last_status_summary_json TEXT,
      last_status_checked_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      source_integration_id TEXT,
      remote_id TEXT,
      email TEXT,
      label TEXT,
      account_id TEXT,
      user_id TEXT,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      plan_type TEXT,
      status TEXT NOT NULL,
      remote_status TEXT,
      notes TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      last_imported_at TEXT,
      last_status_checked_at TEXT,
      last_pushed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS integrations_name_unique
      ON integrations(name);

    CREATE UNIQUE INDEX IF NOT EXISTS accounts_remote_identity_unique
      ON accounts(source_integration_id, remote_id);

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auto_replenish_rules (
      id TEXT PRIMARY KEY,
      integration_id TEXT NOT NULL UNIQUE,
      enabled INTEGER NOT NULL DEFAULT 0,
      trigger_mode TEXT NOT NULL,
      min_usable_accounts INTEGER NOT NULL,
      min_5h_remaining_percent REAL NOT NULL,
      target_usable_accounts INTEGER NOT NULL,
      quota_low_purchase_count INTEGER NOT NULL,
      max_accounts_per_run INTEGER NOT NULL,
      interval_minutes INTEGER NOT NULL,
      credential_filter TEXT NOT NULL,
      respect_rate_limit_recovery INTEGER NOT NULL DEFAULT 1,
      rate_limit_recovery_grace_minutes INTEGER NOT NULL,
      last_run_at TEXT,
      next_run_at TEXT,
      last_status TEXT,
      last_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auto_replenish_runs (
      id TEXT PRIMARY KEY,
      integration_id TEXT NOT NULL,
      trigger_source TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS auto_replenish_runs_integration_created_idx
      ON auto_replenish_runs(integration_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS account_integration_pushes (
      integration_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      first_pushed_at TEXT NOT NULL,
      last_pushed_at TEXT NOT NULL,
      push_count INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (integration_id, account_id)
    );
  `);

  for (const statement of [
    "ALTER TABLE integrations ADD COLUMN last_status_summary_json TEXT",
    "ALTER TABLE integrations ADD COLUMN last_status_checked_at TEXT",
  ]) {
    try {
      db.exec(statement);
    } catch {
      // Existing databases may already include these columns.
    }
  }

  database = db;
  return db;
}

function nowIso() {
  return new Date().toISOString();
}

function toBool(value: unknown) {
  return value === 1 || value === true;
}

function parseJson(value: unknown) {
  if (typeof value !== "string" || !value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function mapIntegrationRow(row: Record<string, unknown>): IntegrationRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    type: row.type as IntegrationRecord["type"],
    baseUrl: String(row.base_url),
    authMode: row.auth_mode as IntegrationRecord["authMode"],
    authValue: typeof row.auth_value === "string" ? row.auth_value : null,
    authHeaderName:
      typeof row.auth_header_name === "string" ? row.auth_header_name : null,
    enabled: toBool(row.enabled),
    notes: typeof row.notes === "string" ? row.notes : null,
    lastTestStatus:
      row.last_test_status === "success" || row.last_test_status === "error"
        ? row.last_test_status
        : null,
    lastTestMessage:
      typeof row.last_test_message === "string" ? row.last_test_message : null,
    lastSyncedAt:
      typeof row.last_synced_at === "string" ? row.last_synced_at : null,
    lastStatusSummary:
      typeof row.last_status_summary_json === "string"
        ? (parseJson(row.last_status_summary_json) as RemoteStatusSummary)
        : null,
    lastStatusCheckedAt:
      typeof row.last_status_checked_at === "string"
        ? row.last_status_checked_at
        : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapAccountRow(row: Record<string, unknown>): AccountRecord {
  return {
    id: String(row.id),
    sourceType: row.source_type as AccountRecord["sourceType"],
    sourceIntegrationId:
      typeof row.source_integration_id === "string"
        ? row.source_integration_id
        : null,
    remoteId: typeof row.remote_id === "string" ? row.remote_id : null,
    email: typeof row.email === "string" ? row.email : null,
    label: typeof row.label === "string" ? row.label : null,
    accountId: typeof row.account_id === "string" ? row.account_id : null,
    userId: typeof row.user_id === "string" ? row.user_id : null,
    accessToken: String(row.access_token),
    refreshToken:
      typeof row.refresh_token === "string" ? row.refresh_token : null,
    planType: typeof row.plan_type === "string" ? row.plan_type : null,
    status: row.status as AccountStatus,
    remoteStatus:
      typeof row.remote_status === "string" ? row.remote_status : null,
    notes: typeof row.notes === "string" ? row.notes : null,
    metadata: parseJson(row.metadata_json),
    lastImportedAt:
      typeof row.last_imported_at === "string" ? row.last_imported_at : null,
    lastStatusCheckedAt:
      typeof row.last_status_checked_at === "string"
        ? row.last_status_checked_at
        : null,
    lastPushedAt:
      typeof row.last_pushed_at === "string" ? row.last_pushed_at : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapLogRow(row: Record<string, unknown>): ActivityLogRecord {
  return {
    id: String(row.id),
    kind: String(row.kind),
    status:
      row.status === "success" || row.status === "error" ? row.status : "info",
    title: String(row.title),
    detail: String(row.detail),
    metadata: parseJson(row.metadata_json),
    createdAt: String(row.created_at),
  };
}

function mapAutoReplenishRuleRow(row: Record<string, unknown>): AutoReplenishRuleRecord {
  return {
    id: String(row.id),
    integrationId: String(row.integration_id),
    enabled: toBool(row.enabled),
    triggerMode: row.trigger_mode as AutoReplenishRuleRecord["triggerMode"],
    minUsableAccounts: Number(row.min_usable_accounts ?? 0),
    min5hRemainingPercent: Number(row.min_5h_remaining_percent ?? 0),
    targetUsableAccounts: Number(row.target_usable_accounts ?? 0),
    quotaLowPurchaseCount: Number(row.quota_low_purchase_count ?? 0),
    maxAccountsPerRun: Number(row.max_accounts_per_run ?? 0),
    intervalMinutes: Number(row.interval_minutes ?? 0),
    credentialFilter:
      row.credential_filter as AutoReplenishRuleRecord["credentialFilter"],
    respectRateLimitRecovery: toBool(row.respect_rate_limit_recovery),
    rateLimitRecoveryGraceMinutes: Number(
      row.rate_limit_recovery_grace_minutes ?? 0,
    ),
    lastRunAt: typeof row.last_run_at === "string" ? row.last_run_at : null,
    nextRunAt: typeof row.next_run_at === "string" ? row.next_run_at : null,
    lastStatus:
      row.last_status === "success" ||
      row.last_status === "error" ||
      row.last_status === "skipped"
        ? row.last_status
        : null,
    lastMessage: typeof row.last_message === "string" ? row.last_message : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

function mapAutoReplenishRunRow(row: Record<string, unknown>): AutoReplenishRunRecord {
  return {
    id: String(row.id),
    integrationId: String(row.integration_id),
    triggerSource:
      row.trigger_source === "manual" ? "manual" : "scheduled",
    status:
      row.status === "success" ||
      row.status === "error" ||
      row.status === "skipped"
        ? row.status
        : "skipped",
    message: String(row.message),
    metadata: parseJson(row.metadata_json),
    createdAt: String(row.created_at),
  };
}

function maskSecret(value: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length <= 10) return `${trimmed.slice(0, 3)}***`;
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

function maskToken(token: string) {
  const trimmed = token.trim();
  if (trimmed.length <= 12) return `${trimmed.slice(0, 4)}***`;
  return `${trimmed.slice(0, 8)}...${trimmed.slice(-4)}`;
}

function buildSummary(accounts: AccountRecord[], integrations: IntegrationRecord[]): DashboardSummary {
  const activeAccounts = accounts.filter((item) => item.status === "active").length;
  const warningAccounts = accounts.filter((item) =>
    ["error", "expired", "banned", "quota_exhausted"].includes(item.status),
  ).length;

  return {
    totalAccounts: accounts.length,
    activeAccounts,
    warningAccounts,
    integrationCount: integrations.length,
  };
}

function toIntegrationView(record: IntegrationRecord): IntegrationViewModel {
  return {
    ...record,
    authConfigured: Boolean(record.authValue),
    authPreview:
      record.authMode === "none"
        ? null
        : record.authMode === "header" && record.authHeaderName
          ? `${record.authHeaderName}: ${maskSecret(record.authValue)}`
          : maskSecret(record.authValue),
  };
}

function toAccountView(record: AccountRecord): AccountViewModel {
  return {
    id: record.id,
    sourceType: record.sourceType,
    sourceIntegrationId: record.sourceIntegrationId,
    remoteId: record.remoteId,
    email: record.email,
    label: record.label,
    accountId: record.accountId,
    userId: record.userId,
    planType: record.planType,
    status: record.status,
    remoteStatus: record.remoteStatus,
    notes: record.notes,
    tokenPreview: maskToken(record.accessToken),
    hasRefreshToken: Boolean(record.refreshToken),
    lastImportedAt: record.lastImportedAt,
    lastStatusCheckedAt: record.lastStatusCheckedAt,
    lastPushedAt: record.lastPushedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function stringifyJson(value: Record<string, unknown> | undefined) {
  return JSON.stringify(value ?? {});
}

function normalizeNullable(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function createDefaultAutoReplenishRule(
  integrationId: string,
): AutoReplenishRuleRecord {
  return {
    id: null,
    integrationId,
    enabled: false,
    triggerMode: "any",
    minUsableAccounts: 3,
    min5hRemainingPercent: 20,
    targetUsableAccounts: 5,
    quotaLowPurchaseCount: 1,
    maxAccountsPerRun: 3,
    intervalMinutes: 5,
    credentialFilter: "all",
    respectRateLimitRecovery: true,
    rateLimitRecoveryGraceMinutes: 30,
    lastRunAt: null,
    nextRunAt: null,
    lastStatus: null,
    lastMessage: null,
    createdAt: null,
    updatedAt: null,
  };
}

export function listIntegrations() {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM integrations ORDER BY updated_at DESC")
    .all() as Record<string, unknown>[];
  return rows.map(mapIntegrationRow);
}

export function listAccounts() {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM accounts ORDER BY updated_at DESC, created_at DESC")
    .all() as Record<string, unknown>[];
  return rows.map(mapAccountRow);
}

export function listActivityLogs(limit = 12) {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT ?")
    .all(limit) as Record<string, unknown>[];
  return rows.map(mapLogRow);
}

export function listAutoReplenishRules() {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM auto_replenish_rules ORDER BY updated_at DESC")
    .all() as Record<string, unknown>[];
  return rows.map(mapAutoReplenishRuleRow);
}

export function listAutoReplenishRuns(limit = 60) {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM auto_replenish_runs ORDER BY created_at DESC LIMIT ?")
    .all(limit) as Record<string, unknown>[];
  return rows.map(mapAutoReplenishRunRow);
}

export function getAutoReplenishRuleByIntegrationId(integrationId: string) {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM auto_replenish_rules WHERE integration_id = ?")
    .get(integrationId) as Record<string, unknown> | undefined;
  return row ? mapAutoReplenishRuleRow(row) : createDefaultAutoReplenishRule(integrationId);
}

export function getIntegrationById(id: string) {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM integrations WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  return row ? mapIntegrationRow(row) : null;
}

export function getAccountsByIds(ids: string[]) {
  if (ids.length === 0) return [];
  const db = getDb();
  const placeholders = ids.map(() => "?").join(", ");
  const rows = db
    .prepare(`SELECT * FROM accounts WHERE id IN (${placeholders})`)
    .all(...ids) as Record<string, unknown>[];
  return rows.map(mapAccountRow);
}

export function listPushedAccountStatesByIntegration(integrationId: string) {
  const db = getDb();
  return db
    .prepare(`
      SELECT integration_id, account_id, first_pushed_at, last_pushed_at, push_count
      FROM account_integration_pushes
      WHERE integration_id = ?
    `)
    .all(integrationId) as Array<Record<string, unknown>>;
}

export function createIntegration(input: IntegrationInput) {
  const db = getDb();
  const timestamp = nowIso();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO integrations (
      id, name, type, base_url, auth_mode, auth_value, auth_header_name,
      enabled, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).run(
    id,
    input.name.trim(),
    input.type,
    input.baseUrl,
    input.authMode,
    normalizeNullable(input.authValue),
    normalizeNullable(input.authHeaderName),
    normalizeNullable(input.notes),
    timestamp,
    timestamp,
  );

  return getIntegrationById(id);
}

export function deleteIntegration(id: string) {
  const db = getDb();
  db.prepare("DELETE FROM auto_replenish_rules WHERE integration_id = ?").run(id);
  db.prepare("DELETE FROM auto_replenish_runs WHERE integration_id = ?").run(id);
  db.prepare("DELETE FROM account_integration_pushes WHERE integration_id = ?").run(id);
  db.prepare("DELETE FROM integrations WHERE id = ?").run(id);
}

export function createManualAccount(input: ManualAccountInput) {
  const db = getDb();
  const timestamp = nowIso();
  const id = randomUUID();

  db.prepare(`
    INSERT INTO accounts (
      id, source_type, source_integration_id, remote_id, email, label, account_id,
      user_id, access_token, refresh_token, plan_type, status, remote_status,
      notes, metadata_json, last_imported_at, last_status_checked_at, last_pushed_at,
      created_at, updated_at
    ) VALUES (?, 'manual', NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', NULL, NULL, NULL, ?, ?)
  `).run(
    id,
    normalizeNullable(input.email),
    normalizeNullable(input.label),
    normalizeNullable(input.accountId),
    normalizeNullable(input.userId),
    input.accessToken.trim(),
    normalizeNullable(input.refreshToken),
    normalizeNullable(input.planType),
    input.status,
    input.status,
    normalizeNullable(input.notes),
    timestamp,
    timestamp,
  );

  return id;
}

export function findManualAccountByCredential(input: {
  accessToken?: string | null;
  refreshToken?: string | null;
}) {
  const db = getDb();
  const accessToken = input.accessToken?.trim();
  const refreshToken = input.refreshToken?.trim();

  if (accessToken) {
    const row = db
      .prepare("SELECT id FROM accounts WHERE source_type = 'manual' AND access_token = ? LIMIT 1")
      .get(accessToken) as { id?: string } | undefined;
    if (row?.id) return row.id;
  }

  if (refreshToken) {
    const row = db
      .prepare("SELECT id FROM accounts WHERE source_type = 'manual' AND refresh_token = ? LIMIT 1")
      .get(refreshToken) as { id?: string } | undefined;
    if (row?.id) return row.id;
  }

  return null;
}

export function updateAccount(
  id: string,
  patch: { label?: string; notes?: string; status?: AccountStatus },
) {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM accounts WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  if (!existing) return null;

  const row = mapAccountRow(existing);
  const timestamp = nowIso();

  db.prepare(`
    UPDATE accounts
    SET label = ?, notes = ?, status = ?, updated_at = ?
    WHERE id = ?
  `).run(
    patch.label !== undefined ? normalizeNullable(patch.label) : row.label,
    patch.notes !== undefined ? normalizeNullable(patch.notes) : row.notes,
    patch.status ?? row.status,
    timestamp,
    id,
  );

  return id;
}

export function deleteAccount(id: string) {
  const db = getDb();
  db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
}

function normalizeStatus(value?: string | null): AccountStatus {
  const normalized = value?.trim().toLowerCase();
  switch (normalized) {
    case "active":
    case "inactive":
    case "disabled":
    case "expired":
    case "banned":
    case "error":
    case "quota_exhausted":
    case "refreshing":
      return normalized;
    default:
      return "unknown";
  }
}

function remoteFingerprint(account: RemoteAccount) {
  const base = [
    account.remoteId ?? "",
    account.accountId ?? "",
    account.userId ?? "",
    account.email ?? "",
    account.accessToken ?? "",
  ].join("|");
  return createHash("sha1").update(base).digest("hex");
}

function findExistingImportedAccount(
  integrationId: string,
  account: RemoteAccount,
) {
  const db = getDb();

  if (account.remoteId) {
    const byRemote = db
      .prepare(
        "SELECT * FROM accounts WHERE source_integration_id = ? AND remote_id = ?",
      )
      .get(integrationId, account.remoteId) as Record<string, unknown> | undefined;
    if (byRemote) return mapAccountRow(byRemote);
  }

  if (account.accountId && account.userId) {
    const byIds = db
      .prepare(
        "SELECT * FROM accounts WHERE source_integration_id = ? AND account_id = ? AND user_id = ? LIMIT 1",
      )
      .get(
        integrationId,
        account.accountId,
        account.userId,
      ) as Record<string, unknown> | undefined;
    if (byIds) return mapAccountRow(byIds);
  }

  if (account.accountId && account.email) {
    const byAccount = db
      .prepare(
        "SELECT * FROM accounts WHERE source_integration_id = ? AND account_id = ? AND email = ? LIMIT 1",
      )
      .get(
        integrationId,
        account.accountId,
        account.email,
      ) as Record<string, unknown> | undefined;
    if (byAccount) return mapAccountRow(byAccount);
  }

  if (account.email) {
    const byEmail = db
      .prepare(
        "SELECT * FROM accounts WHERE source_integration_id = ? AND email = ? LIMIT 1",
      )
      .get(integrationId, account.email) as Record<string, unknown> | undefined;
    if (byEmail) return mapAccountRow(byEmail);
  }

  if (account.accessToken) {
    const byToken = db
      .prepare(
        "SELECT * FROM accounts WHERE source_integration_id = ? AND access_token = ? LIMIT 1",
      )
      .get(
        integrationId,
        account.accessToken,
      ) as Record<string, unknown> | undefined;
    if (byToken) return mapAccountRow(byToken);
  }

  return null;
}

export function upsertImportedAccounts(
  integration: IntegrationRecord,
  accounts: RemoteAccount[],
) {
  const db = getDb();
  const timestamp = nowIso();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  const insertStatement = db.prepare(`
    INSERT INTO accounts (
      id, source_type, source_integration_id, remote_id, email, label, account_id, user_id,
      access_token, refresh_token, plan_type, status, remote_status, notes, metadata_json,
      last_imported_at, last_status_checked_at, last_pushed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
  `);

  const updateStatement = db.prepare(`
    UPDATE accounts
    SET remote_id = ?, email = ?, label = ?, account_id = ?, user_id = ?, access_token = ?,
        refresh_token = ?, plan_type = ?, status = ?, remote_status = ?, notes = ?,
        metadata_json = ?, last_imported_at = ?, last_status_checked_at = ?, updated_at = ?
    WHERE id = ?
  `);

  for (const item of accounts) {
    if (!item.accessToken?.trim()) {
      skipped += 1;
      continue;
    }

    const remoteId = normalizeNullable(item.remoteId) ?? remoteFingerprint(item);
    const existing = findExistingImportedAccount(integration.id, {
      ...item,
      remoteId,
    });

    if (existing) {
      updateStatement.run(
        remoteId,
        normalizeNullable(item.email),
        normalizeNullable(item.label) ?? existing.label,
        normalizeNullable(item.accountId),
        normalizeNullable(item.userId),
        item.accessToken.trim(),
        normalizeNullable(item.refreshToken),
        normalizeNullable(item.planType),
        normalizeStatus(item.status),
        normalizeNullable(item.status),
        normalizeNullable(item.notes) ?? existing.notes,
        stringifyJson(item.metadata),
        timestamp,
        timestamp,
        timestamp,
        existing.id,
      );
      updated += 1;
      continue;
    }

    insertStatement.run(
      randomUUID(),
      integration.type,
      integration.id,
      remoteId,
      normalizeNullable(item.email),
      normalizeNullable(item.label),
      normalizeNullable(item.accountId),
      normalizeNullable(item.userId),
      item.accessToken.trim(),
      normalizeNullable(item.refreshToken),
      normalizeNullable(item.planType),
      normalizeStatus(item.status),
      normalizeNullable(item.status),
      normalizeNullable(item.notes),
      stringifyJson(item.metadata),
      timestamp,
      timestamp,
      timestamp,
      timestamp,
    );
    created += 1;
  }

  db.prepare(`
    UPDATE integrations
    SET last_synced_at = ?, updated_at = ?
    WHERE id = ?
  `).run(timestamp, timestamp, integration.id);

  return { created, updated, skipped, imported: created + updated };
}

export function upsertAutoReplenishRule(
  integrationId: string,
  input: AutoReplenishRuleInput,
) {
  const db = getDb();
  const existing = db
    .prepare("SELECT id, created_at FROM auto_replenish_rules WHERE integration_id = ?")
    .get(integrationId) as
    | { id?: string; created_at?: string }
    | undefined;
  const timestamp = nowIso();
  const id = typeof existing?.id === "string" ? existing.id : randomUUID();

  db.prepare(`
    INSERT INTO auto_replenish_rules (
      id, integration_id, enabled, trigger_mode, min_usable_accounts,
      min_5h_remaining_percent, target_usable_accounts, quota_low_purchase_count,
      max_accounts_per_run, interval_minutes, credential_filter,
      respect_rate_limit_recovery, rate_limit_recovery_grace_minutes,
      last_run_at, next_run_at, last_status, last_message, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL, ?, ?)
    ON CONFLICT(integration_id) DO UPDATE SET
      enabled = excluded.enabled,
      trigger_mode = excluded.trigger_mode,
      min_usable_accounts = excluded.min_usable_accounts,
      min_5h_remaining_percent = excluded.min_5h_remaining_percent,
      target_usable_accounts = excluded.target_usable_accounts,
      quota_low_purchase_count = excluded.quota_low_purchase_count,
      max_accounts_per_run = excluded.max_accounts_per_run,
      interval_minutes = excluded.interval_minutes,
      credential_filter = excluded.credential_filter,
      respect_rate_limit_recovery = excluded.respect_rate_limit_recovery,
      rate_limit_recovery_grace_minutes = excluded.rate_limit_recovery_grace_minutes,
      next_run_at = excluded.next_run_at,
      updated_at = excluded.updated_at
  `).run(
    id,
    integrationId,
    input.enabled ? 1 : 0,
    input.triggerMode,
    input.minUsableAccounts,
    input.min5hRemainingPercent,
    input.targetUsableAccounts,
    input.quotaLowPurchaseCount,
    input.maxAccountsPerRun,
    input.intervalMinutes,
    input.credentialFilter,
    input.respectRateLimitRecovery ? 1 : 0,
    input.rateLimitRecoveryGraceMinutes,
    input.enabled
      ? new Date(Date.now() + input.intervalMinutes * 60_000).toISOString()
      : null,
    existing?.created_at ?? timestamp,
    timestamp,
  );

  return getAutoReplenishRuleByIntegrationId(integrationId);
}

export function markAccountsPushed(accountIds: string[]) {
  if (accountIds.length === 0) return;
  const db = getDb();
  const timestamp = nowIso();
  const placeholders = accountIds.map(() => "?").join(", ");
  db.prepare(`
    UPDATE accounts
    SET last_pushed_at = ?, updated_at = ?
    WHERE id IN (${placeholders})
  `).run(timestamp, timestamp, ...accountIds);
}

export function recordAccountsPushedToIntegration(
  integrationId: string,
  accountIds: string[],
) {
  if (accountIds.length === 0) return;
  const db = getDb();
  const timestamp = nowIso();
  const insert = db.prepare(`
    INSERT INTO account_integration_pushes (
      integration_id, account_id, first_pushed_at, last_pushed_at, push_count
    ) VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(integration_id, account_id) DO UPDATE SET
      last_pushed_at = excluded.last_pushed_at,
      push_count = account_integration_pushes.push_count + 1
  `);

  for (const accountId of accountIds) {
    insert.run(integrationId, accountId, timestamp, timestamp);
  }
}

export function updateAutoReplenishRuleExecution(
  integrationId: string,
  patch: {
    lastRunAt: string;
    nextRunAt: string | null;
    lastStatus: AutoReplenishRunStatus;
    lastMessage: string;
  },
) {
  const db = getDb();
  db.prepare(`
    UPDATE auto_replenish_rules
    SET last_run_at = ?, next_run_at = ?, last_status = ?, last_message = ?, updated_at = ?
    WHERE integration_id = ?
  `).run(
    patch.lastRunAt,
    patch.nextRunAt,
    patch.lastStatus,
    patch.lastMessage,
    patch.lastRunAt,
    integrationId,
  );
}

export function addAutoReplenishRun(
  integrationId: string,
  triggerSource: "manual" | "scheduled",
  status: AutoReplenishRunStatus,
  message: string,
  metadata?: Record<string, unknown>,
) {
  const db = getDb();
  db.prepare(`
    INSERT INTO auto_replenish_runs (
      id, integration_id, trigger_source, status, message, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    integrationId,
    triggerSource,
    status,
    message,
    stringifyJson(metadata),
    nowIso(),
  );
}

export function updateIntegrationHealth(
  integrationId: string,
  status: "success" | "error",
  message: string,
) {
  const db = getDb();
  const timestamp = nowIso();
  db.prepare(`
    UPDATE integrations
    SET last_test_status = ?, last_test_message = ?, updated_at = ?
    WHERE id = ?
  `).run(status, message, timestamp, integrationId);
}

export function updateIntegrationRemoteStatusSummary(
  integrationId: string,
  summary: RemoteStatusSummary,
) {
  const db = getDb();
  const timestamp = summary.updatedAt || nowIso();
  db.prepare(`
    UPDATE integrations
    SET last_status_summary_json = ?, last_status_checked_at = ?, updated_at = ?
    WHERE id = ?
  `).run(
    JSON.stringify(summary),
    summary.updatedAt,
    timestamp,
    integrationId,
  );
}

export function addActivityLog(
  kind: string,
  status: "success" | "error" | "info",
  title: string,
  detail: string,
  metadata?: Record<string, unknown>,
) {
  const db = getDb();
  db.prepare(`
    INSERT INTO activity_logs (id, kind, status, title, detail, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    kind,
    status,
    title,
    detail,
    stringifyJson(metadata),
    nowIso(),
  );
}

export function getDashboardData(): DashboardData {
  const integrations = listIntegrations();
  const accounts = listAccounts();
  const logs = listActivityLogs();
  const storedRules = new Map(
    listAutoReplenishRules().map((item) => [item.integrationId, item] as const),
  );
  const autoRuns = listAutoReplenishRuns();
  const autoRules = integrations.map(
    (integration) =>
      storedRules.get(integration.id) ??
      createDefaultAutoReplenishRule(integration.id),
  );

  return {
    summary: buildSummary(accounts, integrations),
    accounts: accounts.map(toAccountView),
    integrations: integrations.map(toIntegrationView),
    logs,
    autoRules,
    autoRuns,
  };
}
