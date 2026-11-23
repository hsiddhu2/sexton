// A hosted-shaped scan response with remediations renders the plan. Spec: .kiro/specs/hosted-plans, Requirement 9.3.
// The entries have the shape GET /api/scan now sends: attachRemediations output with an intent for a proposed bump
// and none for a package with no safe version. The web app needs no code change for it.

import type { PackageHealth, ScanResponse } from "@sexton/api";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Drawer } from "../src/drawer/Drawer.js";
import { drawerModel } from "../src/drawer/drawer-model.js";
import { validateScanResponse } from "../src/load/validate-scan-response.js";
import { cheapScan } from "./arbitraries.js";

afterEach(cleanup);

function hosted(): { response: ScanResponse; bumped: PackageHealth; stuck: PackageHealth } {
  const base = cheapScan(2);
  const [bumped, stuck] = base.report.packages as [PackageHealth, PackageHealth];
  const body = `## Sexton: bump ${bumped.name}\n\nWhy: the package is ${bumped.state}.`;
  const response = {
    ...base,
    remediations: [
      {
        packageName: bumped.name,
        kind: "bump",
        status: "proposed",
        title: `Sexton: bump ${bumped.name} to 9.9.9`,
        summary: `Bump ${bumped.name} from ${bumped.installedVersion} to 9.9.9`,
        prBody: body,
        chosenVersion: "9.9.9",
        majorUpgrade: true,
        intent: {
          branch: `sexton/bump-${bumped.name}`,
          title: `Sexton: bump ${bumped.name} to 9.9.9`,
          body,
          files: [{ path: "package.json", op: "set-range", section: "dependencies", name: bumped.name, range: "^9.9.9" }],
          baseRef: "@default",
          reviewComments: [],
        },
      },
      {
        packageName: stuck.name,
        kind: "bump",
        status: "no-safe-version",
        title: `Sexton: no change proposed for ${stuck.name}`,
        summary: `No change proposed for ${stuck.name}: no safe version found among 4 evaluated candidate versions`,
        prBody: `## Sexton: no change proposed for ${stuck.name}`,
      },
    ],
  } as unknown as ScanResponse;
  return { response, bumped, stuck };
}

describe("hosted scan response with remediations (9.3)", () => {
  it("passes the validator unchanged", () => {
    expect(validateScanResponse(JSON.parse(JSON.stringify(hosted().response)))).toMatchObject({ ok: true });
  });

  it("renders the proposed plan and its PR body in the drawer", () => {
    const { response, bumped } = hosted();
    render(<Drawer model={drawerModel(response, bumped)} onClose={() => undefined} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain(`Sexton: bump ${bumped.name} to 9.9.9`);
    expect(dialog.querySelector(".pr-preview h5")?.textContent).toBe(`Sexton: bump ${bumped.name}`);
  });

  it("renders the no-change plan for the other package", () => {
    const { response, stuck } = hosted();
    render(<Drawer model={drawerModel(response, stuck)} onClose={() => undefined} />);
    expect(screen.getByRole("dialog").textContent).toContain(`Sexton: no change proposed for ${stuck.name}`);
  });
});
