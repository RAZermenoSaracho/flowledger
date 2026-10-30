/**
 * Returns `target` only if it is a same-origin relative path (starts with a single "/"),
 * otherwise `fallback`. Rejects protocol-relative ("//x"), backslash ("/\x"), absolute URLs
 * and control characters, including their percent-encoded forms.
 */
export function safeRedirect(target: string | null | undefined, fallback = "/"): string {
  if (!target) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(target);
  } catch {
    return fallback;
  }
  const unsafe = (value: string) =>
    !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || [...value].some((char) => char.charCodeAt(0) < 32);
  return unsafe(target) || unsafe(decoded) ? fallback : target;
}
