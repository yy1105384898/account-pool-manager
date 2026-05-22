import "server-only";

import type { AccountRecord, IntegrationRecord } from "@/lib/types";
import {
  importFromCodexProxy,
  pushToCodexProxy,
  readCodexProxyStatus,
  testCodexProxy,
} from "@/lib/server/connectors/codexproxy";
import {
  importFromSub2Api,
  pushToSub2Api,
  readSub2ApiStatus,
  testSub2Api,
} from "@/lib/server/connectors/sub2api";

export async function testIntegrationConnection(integration: IntegrationRecord) {
  if (integration.type === "codexproxy" || integration.type === "cpa") {
    return testCodexProxy(integration);
  }
  return testSub2Api(integration);
}

export async function importAccountsFromIntegration(integration: IntegrationRecord) {
  if (integration.type === "codexproxy" || integration.type === "cpa") {
    return importFromCodexProxy(integration);
  }
  return importFromSub2Api(integration);
}

export async function pushAccountsToIntegration(
  integration: IntegrationRecord,
  accounts: AccountRecord[],
) {
  if (integration.type === "codexproxy" || integration.type === "cpa") {
    return pushToCodexProxy(integration, accounts);
  }
  return pushToSub2Api(integration, accounts);
}

export async function readIntegrationRemoteStatus(integration: IntegrationRecord) {
  if (integration.type === "codexproxy" || integration.type === "cpa") {
    return readCodexProxyStatus(integration);
  }
  return readSub2ApiStatus(integration);
}
