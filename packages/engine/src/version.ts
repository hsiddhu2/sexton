// Engine version, read from the package manifest. Requirement 8.1.

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const manifest = require("../package.json") as { version: string };

export const ENGINE_VERSION: string = manifest.version;
export const REPO_URL = "https://github.com/hsiddhu2/sexton";
export const USER_AGENT = `sexton/${ENGINE_VERSION} (+${REPO_URL})`;
