import type { PackageHealth } from "@sexton/api";
import type { Rect } from "../scene/layout.js";
import type { FormView } from "../time/form-at.js";
import { punchline } from "../epitaph/epitaph.js";
import { useLayoutEffect, useRef, useState } from "react";
import { tooltipContent, tooltipPlace, TOOLTIP_EST_H } from "./tooltip-model.js";

export const TOOLTIP_ID = "grave-tooltip";

export interface GraveTooltipProps {
  readonly pkg: PackageHealth;
  readonly cell: Rect;
  readonly view?: FormView;
  readonly asOfDate?: string;
  /** The width of the Scene, to keep the tooltip inside it. */
  readonly sceneWidth?: number;
  /** The height of the Scene, and the other graves' name labels the tooltip keeps off where it can (bug 3). */
  readonly sceneHeight?: number;
  readonly labels?: readonly Rect[];
  /** Serious mode hides the Punchline (spec cemetery-undead, 8.2). */
  readonly serious?: boolean;
  readonly onPointerEnter: () => void;
  readonly onPointerLeave: () => void;
}

export function GraveTooltip({ pkg, cell, view, asOfDate, sceneWidth, sceneHeight, labels = [], serious = false, onPointerEnter, onPointerLeave }: GraveTooltipProps) {
  const content = tooltipContent(pkg, view, asOfDate);
  // Measured before paint, so the first frame already sits in its place.
  const ref = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(TOOLTIP_EST_H);
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    if (h > 0 && h !== height) setHeight(h);
  });
  const scene = sceneWidth === undefined ? undefined : { width: sceneWidth, height: sceneHeight ?? Number.POSITIVE_INFINITY };
  const { left, top, width } = tooltipPlace(cell, scene, height, labels);
  const pending = view !== undefined && view.state === null;
  const line = serious || pending ? null : punchline(content.state, content.reason);
  return (
    <div
      ref={ref}
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
        <span className={`tooltip-state tooltip-state-${content.stateText === content.state ? content.state.toLowerCase() : "pending"}`}>{content.stateText}</span>
      </span>
      <span className="tooltip-line">{content.reason}</span>
      {line === null ? null : <span className="tooltip-line epitaph-punchline">{line}</span>}
      <span className="tooltip-line">{content.advisoryText}</span>
      {content.asOfText === null ? null : <span className="tooltip-line">{content.asOfText}</span>}
    </div>
  );
}
