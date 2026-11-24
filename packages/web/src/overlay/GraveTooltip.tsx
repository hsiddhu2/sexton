import type { PackageHealth } from "@sexton/api";
import type { Rect } from "../scene/layout.js";
import type { FormView } from "../time/form-at.js";
import { punchline } from "../epitaph/epitaph.js";
import { tooltipContent, tooltipRect } from "./tooltip-model.js";

export const TOOLTIP_ID = "grave-tooltip";

export interface GraveTooltipProps {
  readonly pkg: PackageHealth;
  readonly cell: Rect;
  readonly view?: FormView;
  readonly asOfDate?: string;
  /** The width of the Scene, to keep the tooltip inside it. */
  readonly sceneWidth?: number;
  /** Serious mode hides the Punchline (spec cemetery-undead, 8.2). */
  readonly serious?: boolean;
  readonly onPointerEnter: () => void;
  readonly onPointerLeave: () => void;
}

export function GraveTooltip({ pkg, cell, view, asOfDate, sceneWidth, serious = false, onPointerEnter, onPointerLeave }: GraveTooltipProps) {
  const content = tooltipContent(pkg, view, asOfDate);
  const { left, top, width } = tooltipRect(cell, sceneWidth);
  const pending = view !== undefined && view.state === null;
  const line = serious || pending ? null : punchline(content.state, content.reason);
  return (
    <div
      id={TOOLTIP_ID}
      role="tooltip"
      className="grave-tooltip"
      style={{ left, top, width }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <span className="epitaph-line">
        {pending ? null : <em className="epitaph-lead">Here lies </em>}
        <strong className="tooltip-name">{content.name}</strong> {content.version}
      </span>
      <span className="tooltip-line">
        {content.version}, <span className={`tooltip-state tooltip-state-${content.stateText === content.state ? content.state.toLowerCase() : "pending"}`}>{content.stateText}</span>
      </span>
      <span className="tooltip-line">{content.reason}</span>
      {line === null ? null : <span className="tooltip-line epitaph-punchline">{line}</span>}
      <span className="tooltip-line">{content.advisoryText}</span>
      {content.asOfText === null ? null : <span className="tooltip-line">{content.asOfText}</span>}
    </div>
  );
}
