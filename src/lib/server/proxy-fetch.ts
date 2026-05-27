import "server-only";

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { RequestOptions } from "node:https";
import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import type { ProxyRecord } from "@/lib/types";
import { getNextEnabledProxy } from "@/lib/server/db";

export function resolveProxyUrl(proxy?: ProxyRecord | null) {
  return proxy?.enabled ? proxy.url : null;
}

function createProxyAgent(proxyUrl: string, targetProtocol: string) {
  const protocol = new URL(proxyUrl).protocol.toLowerCase();
  if (protocol.startsWith("socks")) return new SocksProxyAgent(proxyUrl);
  if (protocol === "http:" || protocol === "https:") {
    return targetProtocol === "https:"
      ? new HttpsProxyAgent(proxyUrl)
      : new HttpProxyAgent(proxyUrl);
  }

  throw new Error(`不支持的代理协议：${protocol.replace(":", "")}`);
}

function bodyToBuffer(body: RequestInit["body"]) {
  if (!body) return null;
  if (typeof body === "string") return Buffer.from(body);
  if (body instanceof URLSearchParams) return Buffer.from(body.toString());
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }

  throw new Error("当前代理请求暂不支持这种请求体");
}

function proxyErrorMessage(error: NodeJS.ErrnoException) {
  const code = error.code ? String(error.code) : "";
  if (code === "ECONNRESET") return "代理连接被重置";
  if (code === "ETIMEDOUT") return "代理连接超时";
  if (code === "ECONNREFUSED") return "代理端口拒绝连接";
  if (code === "ENOTFOUND") return "代理地址无法解析";
  if (code === "EHOSTUNREACH" || code === "ENETUNREACH") return "代理网络不可达";
  const message = typeof error.message === "string" && error.message.trim()
    ? error.message
    : JSON.stringify(error);
  return code ? `${message} (${code})` : message;
}

async function fetchWithNodeProxy(input: string, init: RequestInit, proxyUrl: string) {
  const target = new URL(input);
  const body = bodyToBuffer(init.body);
  const headers = new Headers(init.headers);
  if (body && !headers.has("content-length")) {
    headers.set("content-length", String(body.byteLength));
  }

  const requestOptions: RequestOptions = {
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || undefined,
    path: `${target.pathname}${target.search}`,
    method: init.method ?? (body ? "POST" : "GET"),
    headers: Object.fromEntries(headers.entries()),
    agent: createProxyAgent(proxyUrl, target.protocol) as RequestOptions["agent"],
    timeout: 20000,
  };
  const transport = target.protocol === "http:" ? httpRequest : httpsRequest;

  return new Promise<Response>((resolve, reject) => {
    const req = transport(requestOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        resolve(
          new Response(Buffer.concat(chunks), {
            status: res.statusCode ?? 0,
            statusText: res.statusMessage,
            headers: res.headers as HeadersInit,
          }),
        );
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error("代理请求超时"));
    });
    req.on("error", (error: NodeJS.ErrnoException) => {
      reject(new Error(proxyErrorMessage(error)));
    });

    if (init.signal) {
      if (init.signal.aborted) req.destroy(new Error("请求已取消"));
      init.signal.addEventListener("abort", () => req.destroy(new Error("请求已取消")), {
        once: true,
      });
    }

    if (body) req.write(body);
    req.end();
  });
}

export async function fetchViaProxy(
  input: string,
  init: RequestInit = {},
  proxy?: ProxyRecord | null,
) {
  const selectedProxy = proxy === undefined ? getNextEnabledProxy() : proxy;
  const proxyUrl = resolveProxyUrl(selectedProxy);
  if (!proxyUrl) return fetch(input, init);

  return fetchWithNodeProxy(input, init, proxyUrl);
}
