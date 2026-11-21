// Engine version, a plain constant so the module evaluates in a bundle. Requirements 2.1, 2.2.
// test/version.test.ts checks it against packages/engine/package.json. Bump both together.

export const ENGINE_VERSION = "0.1.0";
export const REPO_URL = "https://github.com/hsiddhu2/sexton";
export const USER_AGENT = `sexton/${ENGINE_VERSION} (+${REPO_URL})`;
