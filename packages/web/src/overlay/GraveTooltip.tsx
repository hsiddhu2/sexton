import type { PackageHealth } from "@sexton/api";
import type { Rect } from "../scene/layout.js";
import type { FormView } from "../time/form-at.js";
import { tooltipContent, tooltipRect } from "./tooltip-model.js";

export const TOOLTIP_ID = "grave-tooltip";

export interface GraveTooltipProps {
  readonly pkg: PackageHealth;
  readonly cell: Rect;
  readonly view?: FormView;
  readonly asOfDate?: string;
  readonly onPointerEnter: () => void;
  readonly onPointerLeave: () => void;
}

export function GraveTooltip({ pkg, cell, view, asOfDate, onPointerEnter, onPointerLeave }: GraveTooltipProps) {
  const content = tooltipContent(pkg, view, asOfDate);
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
        {content.version}, {content.stateText}
      </span>
      <span className="tooltip-line">{content.reason}</span>
      <span className="tooltip-line">{content.advisoryText}</span>
      {content.asOfText === null ? null : <span className="tooltip-line">{content.asOfText}</span>}
    </div>
  );
}
