// A link to a Route of the Site (spec home-page, design C3): a real href, followed without a reload on a plain
// primary press.
import type { MouseEvent, ReactNode } from "react";
import type { Navigate, NavIntent } from "../site/Root.js";

export interface SiteLinkProps {
  readonly to: string;
  readonly onNavigate: Navigate;
  readonly intent?: NavIntent;
  readonly className?: string;
  readonly children: ReactNode;
}

export function SiteLink({ to, onNavigate, intent, className, children }: SiteLinkProps) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate(to, intent);
  };
  return (
    <a href={to} className={className} onClick={onClick}>
      {children}
    </a>
  );
}
