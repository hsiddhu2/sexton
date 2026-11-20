// Routed transport for intake tests. Answers by URL, records requests, supports json() and text(). No network.
import type { TextBody, Transport, TransportRequest, TransportResponse } from "../../src/http.js";

export interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
}

export interface RouteBehaviour {
  readonly status?: number;
  /** Body as text or raw bytes. */
  readonly body?: string | Uint8Array;
  readonly throws?: unknown;
  readonly delayMs?: number;
  /** When true the response has no text() method. */
  readonly noText?: boolean;
  /** Promise resolved before the response is returned, for completion-order control. */
  readonly gate?: Promise<void>;
}

export type RouteTable = Readonly<Record<string, RouteBehaviour | undefined>>;

/** Wraps a string or bytes in a ReadableStream of fixed-size chunks. */
export function streamOf(data: string | Uint8Array, chunkSize = 64 * 1024): ReadableStream<Uint8Array> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.subarray(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
}

/** Applies the byte limit and decoding rules of createFetchTransport's text(). */
export async function limitedText(data: string | Uint8Array, limitBytes: number): Promise<TextBody> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  if (bytes.byteLength > limitBytes) return { ok: false, reason: "too-large" };
  try {
    return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, reason: "invalid-encoding" };
  }
}

export function routedTextTransport(routes: RouteTable): { transport: Transport; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const transport: Transport = async (url: string, request: TransportRequest) => {
    requests.push({ url, method: request.method, headers: { ...request.headers } });
    const route = Object.hasOwn(routes, url) ? routes[url] : undefined;
    if (route?.delayMs !== undefined) await new Promise((resolve) => setTimeout(resolve, route.delayMs));
    if (route?.gate !== undefined) await route.gate;
    if (route?.throws !== undefined) throw route.throws;
    const body = route?.body ?? "";
    const base = {
      status: route === undefined ? 404 : (route.status ?? 200),
      json: () => Promise.resolve(JSON.parse(typeof body === "string" ? body : new TextDecoder().decode(body)) as unknown),
    };
    const response: TransportResponse = route?.noText === true ? base : { ...base, text: (limit: number) => limitedText(body, limit) };
    return response;
  };
  return { transport, requests };
}
