// The plain label of every signal (spec clean-site, design C5). A typed record over SIGNAL_NAMES, so a new signal
// without a label fails typecheck.
import type { SignalName } from "@sexton/api";

export const SIGNAL_LABELS: { readonly [K in SignalName]: string } = {
  lastPublish: "Last publish",
  deprecated: "Deprecated",
  hasInstallScript: "Install script",
  advisories: "Advisories",
  maintainers: "Maintainers",
  provenance: "Provenance",
  transitiveReach: "Transitive reach",
  maintainerChange: "Maintainer change",
  provenanceRegression: "Provenance lost",
  newInstallScript: "New install script",
  publisherChange: "Publisher change",
  newDependency: "New dependency",
};
