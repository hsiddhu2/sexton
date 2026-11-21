// git check-ref-format --branch rules as a pure predicate, plus "{". Spec: .kiro/specs/remediation, Requirement 4.5.

// eslint-disable-next-line no-control-regex -- control characters are exactly what this rejects
const FORBIDDEN = /[\u0000-\u001f\u007f ~^:?*[\\{]/;

export function isValidBranchName(ref: string): boolean {
  if (typeof ref !== "string" || ref.length === 0 || ref === "@") return false;
  if (ref.startsWith("/") || ref.endsWith("/") || ref.endsWith(".")) return false;
  if (ref.includes("//") || ref.includes("..") || ref.includes("@{") || FORBIDDEN.test(ref)) return false;
  return ref.split("/").every((part) => part.length > 0 && !part.startsWith(".") && !part.endsWith(".lock"));
}
