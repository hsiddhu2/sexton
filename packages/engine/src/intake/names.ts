// npm package-name validator. Spec: .kiro/specs/repo-intake, Requirement 8.2, 8.3. Pure.

export const MAX_PACKAGE_NAME_LENGTH = 214;

function isLower(c: number): boolean {
  return c >= 0x61 && c <= 0x7a;
}
function isUpper(c: number): boolean {
  return c >= 0x41 && c <= 0x5a;
}
function isDigit(c: number): boolean {
  return c >= 0x30 && c <= 0x39;
}
/** - . _ ~ */
function isPunct(c: number): boolean {
  return c === 0x2d || c === 0x2e || c === 0x5f || c === 0x7e;
}

function validPart(part: string, allowUpper: boolean): boolean {
  if (part.length === 0) return false;
  const first = part.charCodeAt(0);
  if (first === 0x2e || first === 0x5f) return false;
  for (let i = 0; i < part.length; i += 1) {
    const c = part.charCodeAt(i);
    if (!(isLower(c) || isDigit(c) || isPunct(c) || (allowUpper && isUpper(c)))) return false;
  }
  return true;
}

/** Uppercase is allowed in the name part only, as npm's validForOldPackages does. */
export function isValidPackageName(name: string): boolean {
  if (name.length === 0 || name.length > MAX_PACKAGE_NAME_LENGTH) return false;
  if (name.startsWith("@")) {
    const slash = name.indexOf("/");
    if (slash === -1 || name.indexOf("/", slash + 1) !== -1) return false;
    return validPart(name.slice(1, slash), false) && validPart(name.slice(slash + 1), true);
  }
  return validPart(name, true);
}
