import "server-only";

import { ProxyAgent } from "undici";
import type { ProxyRecord } from "@/lib/types";
import { getFirstEnabledProxy } from "@/lib/server/db";

export function resolveProxyUrl(proxy?: ProxyRecord | null) {
  return proxy?.enabled ? proxy.url : null;
}

export async function fetchViaProxy(
  input: string,
  init: RequestInit = {},
  proxy?: ProxyRecord | null,
) {
  const proxyUrl = resolveProxyUrl(proxy ?? getFirstEnabledProxy());
  if (!proxyUrl) return fetch(input, init);

  return fetch(input, {
    ...init,
    dispatcher: new ProxyAgent(proxyUrl),
  } as RequestInit & { dispatcher: ProxyAgent });
}
