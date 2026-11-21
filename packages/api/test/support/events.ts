// Builds Lambda function URL events for tests. Only the fields the API reads vary.

import type { LambdaFunctionURLEvent } from "aws-lambda";

export interface EventParts {
  readonly method?: string;
  readonly rawPath?: string;
  readonly rawQueryString?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly requestId?: string;
}

export function makeEvent(parts: EventParts = {}): LambdaFunctionURLEvent {
  const method = parts.method ?? "GET";
  const rawPath = parts.rawPath ?? "/api/scan";
  return {
    version: "2.0",
    routeKey: "$default",
    rawPath,
    rawQueryString: parts.rawQueryString ?? "",
    headers: { ...(parts.headers ?? {}) },
    isBase64Encoded: false,
    requestContext: {
      accountId: "anonymous",
      apiId: "test",
      domainName: "test.lambda-url.us-east-1.on.aws",
      domainPrefix: "test",
      http: { method, path: rawPath, protocol: "HTTP/1.1", sourceIp: "192.0.2.1", userAgent: "test" },
      requestId: parts.requestId ?? "req-1",
      routeKey: "$default",
      stage: "$default",
      time: "20/Nov/2026:00:00:00 +0000",
      timeEpoch: 1_795_132_800_000,
    },
  };
}

/** The query string the web app sends for one repository URL. */
export function repoQuery(url: string): string {
  return `repo=${encodeURIComponent(url)}`;
}
