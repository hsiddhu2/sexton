import type { PackageHealth } from "@sexton/api";
import type { Rect } from "../scene/layout.js";
import { tooltipContent, tooltipRect } from "./tooltip-model.js";

export const TOOLTIP_ID = "grave-tooltip";

export interface GraveTooltipProps {
  readonly pkg: PackageHealth;
  readonly cell: Rect;
  readonly onPointerEnter: () => void;
  readonly onPointerLeave: () => void;
}

export function GraveTooltip({ pkg, cell, onPointerEnter, onPointerLeave }: GraveTooltipProps) {
  const content = tooltipContent(pkg);
  const { left, top, width } = tooltipRect(cell);
  return (
    <div
      id={TOOLTIP_ID}
      role="tooltip"
      className="grave-tooltip"
      style={{ left, top, width }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <strong className="tooltip-name">{content.name}</strong>
      <span className="tooltip-line">
        {content.version}, {content.state}
      </span>
      <span className="tooltip-line">{content.reason}</span>
      <span className="tooltip-line">{content.advisoryText}</span>
    </div>
  );
}
