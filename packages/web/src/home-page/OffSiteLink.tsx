// A link to another site (spec home-page, 2.5): it opens in a new tab, with rel "noopener noreferrer", so the new
// page gets no handle on this one and no referrer.
import type { ReactNode } from "react";

export const OFF_SITE_REL = "noopener noreferrer";

export interface OffSiteLinkProps {
  readonly href: string;
  readonly className?: string;
  readonly children: ReactNode;
}

export function OffSiteLink({ href, className, children }: OffSiteLinkProps) {
  return (
    <a href={href} className={className} target="_blank" rel={OFF_SITE_REL}>
      {children}
    </a>
  );
}
