// The Drawer's data props for a package, as Cemetery builds them (spec clean-site, task 5).
import type { PackageHealth, ScanResponse } from "@sexton/api";
import { drawerModel, type DrawerModel } from "../../src/drawer/drawer-model.js";
import { fixView, type FixView, type ScanKind } from "../../src/drawer/fix-view.js";
import { historyRows, type HistoryRow } from "../../src/drawer/history-rows.js";
import { plansByName } from "../../src/panel/fix-order.js";

export function drawerProps(
  response: ScanResponse,
  pkg: PackageHealth,
  scan: ScanKind = "live",
): { model: DrawerModel; fix: FixView; history: HistoryRow[] | null } {
  return {
    model: drawerModel(response, pkg),
    fix: fixView(pkg, plansByName(response.remediations).get(pkg.name), scan),
    history: historyRows(response, pkg.name),
  };
}
