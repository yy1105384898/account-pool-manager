import "server-only";

import type { AccountRecord, IntegrationPushOptions, IntegrationRecord } from "@/lib/types";
import {
  importFromCpa,
  importFromCodexProxy,
  pushToCpa,
  pushToCodexProxy,
  readCodexProxyAccountTemplate,
  readCpaStatus,
  readCodexProxyStatus,
  testCpa,
  testCodexProxy,
} from "@/lib/server/connectors/codexproxy";
import {
  importFromSub2Api,
  pushToSub2Api,
  readSub2ApiAccountTemplate,
  readSub2ApiStatus,
  testSub2Api,
} from "@/lib/server/connectors/sub2api";

export async function testIntegrationConnection(integration: IntegrationRecord) {
  if (integration.type === "codexproxy") {
    return testCodexProxy(integration);
  }
  if (integration.type === "cpa") {
    return testCpa(integration);
  }
  return testSub2Api(integration);
}

export async function importAccountsFromIntegration(integration: IntegrationRecord) {
  if (integration.type === "codexproxy") {
    return importFromCodexProxy(integration);
  }
  if (integration.type === "cpa") {
    return importFromCpa(integration);
  }
  return importFromSub2Api(integration);
}

export async function pushAccountsToIntegration(
  integration: IntegrationRecord,
  accounts: AccountRecord[],
  options?: IntegrationPushOptions,
) {
  if (integration.type === "codexproxy") {
    return pushToCodexProxy(integration, accounts, options);
  }
  if (integration.type === "cpa") {
    return pushToCpa(integration, accounts, options);
  }
  return pushToSub2Api(integration, accounts, options);
}

export async function readIntegrationRemoteStatus(integration: IntegrationRecord) {
  if (integration.type === "codexproxy") {
    return readCodexProxyStatus(integration);
  }
  if (integration.type === "cpa") {
    return readCpaStatus(integration);
  }
  return readSub2ApiStatus(integration);
}

export async function readIntegrationAccountTemplate(
  integration: IntegrationRecord,
  accountId: string,
) {
  if (integration.type === "codexproxy") {
    return readCodexProxyAccountTemplate(integration, accountId);
  }
  if (integration.type === "sub2api") {
    return readSub2ApiAccountTemplate(integration, accountId);
  }
  return null;
}
