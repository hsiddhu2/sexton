// Spec fresh-site: Cache-Control from CloudFront response headers policies.
// Properties 1 to 4. Requirements 2.1, 2.2, 3.1 to 3.4.

import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ASSET_CACHE_CONTROL,
  ASSET_PATH_PATTERN,
  WEB_CACHE_CONTROL,
  expectedCacheControl,
} from "../lib/web-cache-headers.js";
import { CONTENT_SECURITY_POLICY, HSTS_MAX_AGE_SECONDS } from "../lib/web-security-headers.js";
import { build, policyConfigOf, resourcesOfType, selectBehaviour, type Behaviour, type Built, type Json } from "./helpers.js";

const CACHING_OPTIMIZED = "658327ea-f89d-4fab-a63d-7e88639e58f6";
const CACHING_DISABLED = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad";

const SECURITY_HEADERS_CONFIG = {
  ContentSecurityPolicy: { ContentSecurityPolicy: CONTENT_SECURITY_POLICY, Override: true },
  ContentTypeOptions: { Override: true },
  FrameOptions: { FrameOption: "DENY", Override: true },
  ReferrerPolicy: { ReferrerPolicy: "no-referrer", Override: true },
  StrictTransportSecurity: { AccessControlMaxAgeSec: HSTS_MAX_AGE_SECONDS, IncludeSubdomains: true, Override: true },
};

let built: Built;
beforeAll(() => {
  built = build();
});

const distributionConfig = (): Record<string, Json> => {
  const [[, d]] = resourcesOfType(built.edgeTemplate, "AWS::CloudFront::Distribution") as [[string, { Properties: { DistributionConfig: Record<string, Json> } }]];
  return d.Properties.DistributionConfig;
};

const s3OriginId = (): string => {
  const origins = distributionConfig()["Origins"] as Record<string, Json>[];
  const s3 = origins.filter((o) => o["S3OriginConfig"] !== undefined);
  expect(s3).toHaveLength(1);
  return String(s3[0]?.["Id"]);
};

const policyByPrefix = (prefix: string): Record<string, Json> | undefined =>
  resourcesOfType(built.edgeTemplate, "AWS::CloudFront::ResponseHeadersPolicy").find(([id]) => id.startsWith(prefix))?.[1]
    .Properties?.["ResponseHeadersPolicyConfig"] as Record<string, Json> | undefined;

const cacheControlOf = (config: Record<string, Json>): { value: Json; override: Json }[] => {
  const items = ((config["CustomHeadersConfig"] as { Items?: Record<string, Json>[] } | undefined)?.Items ?? []).filter(
    (h) => String(h["Header"]).toLowerCase() === "cache-control",
  );
  return items.map((h) => ({ value: h["Value"] ?? null, override: h["Override"] ?? null }));
};

const headerFor = (path: string): { behaviour: Behaviour; cacheControl: { value: Json; override: Json }[] } => {
  const behaviour = selectBehaviour(built.edgeTemplate, path);
  return { behaviour, cacheControl: cacheControlOf(policyConfigOf(built.edgeTemplate, behaviour)) };
};

/** Design, Property-Based Tests: a prefix, then up to 40 characters from [A-Za-z0-9._/-]. */
const PREFIXES = ["/", "/demo/", "/replay/", "/fonts/", "/assets/", "/api/", "/api/remediate", "/apix", "/asset", "/Assets/"];
const anyPath = fc
  .tuple(fc.constantFrom(...PREFIXES), fc.stringMatching(/^[A-Za-z0-9._/-]{0,40}$/))
  .map(([prefix, rest]) => prefix + rest);

const unhashedPath = fc.oneof(
  fc.constantFrom("/", "/index.html"),
  anyPath.filter((p) => !p.startsWith("/api/") && !p.startsWith("/assets/")),
);
const assetPath = fc.oneof(
  fc.constant("/assets/index-abc12345.js"),
  anyPath.filter((p) => p.startsWith("/assets/")),
);
const apiPath = fc.oneof(fc.constant("/api/remediate"), anyPath.filter((p) => p.startsWith("/api/")));

describe("Feature: fresh-site, Property 1: unhashed web paths are sent no-cache", () => {
  it("sends Cache-Control no-cache with override from the default behaviour", () => {
    fc.assert(
      fc.property(unhashedPath, (path) => {
        const { behaviour, cacheControl } = headerFor(path);
        expect(behaviour["PathPattern"]).toBeUndefined();
        expect(expectedCacheControl(path)).toBe(WEB_CACHE_CONTROL);
        expect(cacheControl).toEqual([{ value: WEB_CACHE_CONTROL, override: true }]);
      }),
      { numRuns: 100 },
    );
  });

  it.each(["/", "/index.html", "/demo/scan.json", "/replay/axios.json", "/fonts/pirata-one-400.woff2"])(
    "sends no-cache for %s",
    (path) => {
      expect(headerFor(path).cacheControl).toEqual([{ value: WEB_CACHE_CONTROL, override: true }]);
    },
  );

  it("selects the default behaviour for a path the bucket does not hold", () => {
    // Only the behaviour is shown here; the header CloudFront puts on an error response is checked on deploy (Decision 4).
    expect(selectBehaviour(built.edgeTemplate, "/no-such-page")["PathPattern"]).toBeUndefined();
  });
});

describe("Feature: fresh-site, Property 2: hashed assets are sent immutable", () => {
  it("routes /assets/* to the S3 origin with CachingOptimized and Cache-Control immutable", () => {
    const origin = s3OriginId();
    fc.assert(
      fc.property(assetPath, (path) => {
        const { behaviour, cacheControl } = headerFor(path);
        expect(behaviour).toMatchObject({
          PathPattern: ASSET_PATH_PATTERN,
          TargetOriginId: origin,
          CachePolicyId: CACHING_OPTIMIZED,
          ViewerProtocolPolicy: "redirect-to-https",
          Compress: true,
        });
        expect(expectedCacheControl(path)).toBe(ASSET_CACHE_CONTROL);
        expect(cacheControl).toEqual([{ value: ASSET_CACHE_CONTROL, override: true }]);
      }),
      { numRuns: 100 },
    );
  });

  it("sends immutable for /assets/index-abc12345.js", () => {
    expect(headerFor("/assets/index-abc12345.js").cacheControl).toEqual([{ value: ASSET_CACHE_CONTROL, override: true }]);
  });

  it("places /assets/* after the two API behaviours", () => {
    const patterns = (distributionConfig()["CacheBehaviors"] as Behaviour[]).map((b) => b["PathPattern"]);
    expect(patterns).toEqual(["/api/remediate", "/api/*", ASSET_PATH_PATTERN]);
  });
});

describe("response headers policies (2.1, 2.2, 3.1)", () => {
  it("has WebHeaders and AssetHeaders with one Cache-Control header each, and SecurityHeaders with none", () => {
    const web = policyByPrefix("WebHeaders");
    const asset = policyByPrefix("AssetHeaders");
    const security = policyByPrefix("SecurityHeaders");
    expect(web).toBeDefined();
    expect(asset).toBeDefined();
    expect(security).toBeDefined();
    expect((web?.["CustomHeadersConfig"] as { Items: Json[] }).Items).toEqual([
      { Header: "Cache-Control", Value: WEB_CACHE_CONTROL, Override: true },
    ]);
    expect((asset?.["CustomHeadersConfig"] as { Items: Json[] }).Items).toEqual([
      { Header: "Cache-Control", Value: ASSET_CACHE_CONTROL, Override: true },
    ]);
    expect(security?.["CustomHeadersConfig"]).toBeUndefined();
    expect(resourcesOfType(built.edgeTemplate, "AWS::CloudFront::ResponseHeadersPolicy")).toHaveLength(3);
  });
});

describe("Feature: fresh-site, Property 3: API behaviours unchanged", () => {
  it("routes /api/ paths to an API behaviour with SecurityHeaders, no custom header and CachingDisabled", () => {
    fc.assert(
      fc.property(apiPath, (path) => {
        const behaviour = selectBehaviour(built.edgeTemplate, path);
        expect(["/api/remediate", "/api/*"]).toContain(behaviour["PathPattern"]);
        expect(behaviour["CachePolicyId"]).toBe(CACHING_DISABLED);
        expect(JSON.stringify(behaviour["ResponseHeadersPolicyId"])).toContain("SecurityHeaders");
        expect(policyConfigOf(built.edgeTemplate, behaviour)["CustomHeadersConfig"]).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });
});

describe("Feature: fresh-site, Property 4: security headers on every behaviour", () => {
  it("gives every behaviour's policy the same security headers and no CORS", () => {
    const cfg = distributionConfig();
    const behaviours = [cfg["DefaultCacheBehavior"], ...(cfg["CacheBehaviors"] as Json[])] as Behaviour[];
    for (const behaviour of behaviours) {
      const policy = policyConfigOf(built.edgeTemplate, behaviour);
      expect(policy["SecurityHeadersConfig"]).toEqual(SECURITY_HEADERS_CONFIG);
      expect(policy["CorsConfig"]).toBeUndefined();
    }
  });
});

describe("web caching unchanged (3.3, 3.4)", () => {
  it("keeps CachingOptimized and the S3 origin on the default behaviour", () => {
    expect(distributionConfig()["DefaultCacheBehavior"]).toMatchObject({
      CachePolicyId: CACHING_OPTIMIZED,
      TargetOriginId: s3OriginId(),
      ViewerProtocolPolicy: "redirect-to-https",
      Compress: true,
    });
  });

  it("keeps index.html with status 200 and no error caching for 403 and 404", () => {
    expect(distributionConfig()["CustomErrorResponses"]).toEqual([
      { ErrorCode: 403, ResponseCode: 200, ResponsePagePath: "/index.html", ErrorCachingMinTTL: 0 },
      { ErrorCode: 404, ResponseCode: 200, ResponsePagePath: "/index.html", ErrorCachingMinTTL: 0 },
    ]);
  });

  it("keeps one S3 origin and three origin access controls: one S3, two function URL", () => {
    s3OriginId();
    const oacs = resourcesOfType(built.edgeTemplate, "AWS::CloudFront::OriginAccessControl").map(
      ([, r]) => (r.Properties?.["OriginAccessControlConfig"] as Record<string, Json>)["OriginAccessControlOriginType"],
    );
    expect(oacs.sort()).toEqual(["lambda", "lambda", "s3"]);
  });

  it("keeps the bucket deployment's invalidation of /*", () => {
    const deployments = resourcesOfType(built.edgeTemplate, "Custom::CDKBucketDeployment");
    expect(deployments).toHaveLength(1);
    expect(deployments[0]?.[1].Properties?.["DistributionPaths"]).toEqual(["/*"]);
  });
});
