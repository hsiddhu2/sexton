// Security header values for the CloudFront response headers policy. Requirement 5.8, 5.9.

/** Two years. */
export const HSTS_MAX_AGE_SECONDS = 63_072_000;

/**
 * Header CSP. Browsers enforce it together with the web app's meta CSP, so the effective
 * policy is the intersection. Everything the meta CSP allows is allowed here too.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join("; ");
