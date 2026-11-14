import { canonicalizeNotificationRules, DEFAULT_NOTIFICATION_RULES, generateNotificationCode, notificationRulesSchema, type NotificationRules } from "@flowledger/shared";
import { useCallback, useRef, useState } from "react";
import { parseNotificationRules } from "../../../services/notificationModels.client";

const DEFAULT_CODE = generateNotificationCode(DEFAULT_NOTIFICATION_RULES);

/** What the visual editor knows about one version of the script. */
type Parsed =
  | { kind: "rules"; rules: NotificationRules; errors: string[]; rewritesCode: boolean }
  | { kind: "unsupported"; items: { line: number; message: string }[] }
  | { kind: "syntax"; items: { line: number; message: string }[] }
  | { kind: "failed" };

/** State the Form tab renders: `loading` while the script is being read, otherwise one {@link Parsed} outcome. */
export type RulesSync = { kind: "loading" } | Parsed;

/**
 * Keeps the visual rules in step with the draft's `code`, which stays the single source of truth.
 * Rules are a view: `ensureParsed` reads the code through the sandbox (skipped when it already is
 * the default rules or was last parsed/generated), and `applyRules` validates edited rules and,
 * only when valid, writes their canonical code through `setCode`. Opening Form never writes code.
 * `replaceWithDefault` swaps the whole script for the default rules.
 */
export function useRulesSync(code: string, setCode: (code: string) => void) {
  const [result, setResult] = useState<{ code: string; parsed: Parsed } | null>(null);
  const request = useRef(0);
  // Form-open and leave-Code can both ask for the same code at once; a second sandbox call would get 503.
  const inFlight = useRef<string | null>(null);
  const latest = useRef({ code, result });
  latest.current = { code, result };

  const ensureParsed = useCallback(async () => {
    const { code, result } = latest.current;
    if (result?.code === code && result.parsed.kind !== "failed") return;
    if (inFlight.current === code) return;
    const id = ++request.current;
    const done = (parsed: Parsed) => {
      if (id === request.current) setResult({ code, parsed });
    };
    if (code === DEFAULT_CODE) return done({ kind: "rules", rules: DEFAULT_NOTIFICATION_RULES, errors: [], rewritesCode: false });
    inFlight.current = code;
    try {
      const answer = await parseNotificationRules(code);
      if ("rules" in answer) {
        done({ kind: "rules", rules: answer.rules, errors: [], rewritesCode: generateNotificationCode(answer.rules) !== code });
      } else if ("unsupported" in answer) done({ kind: "unsupported", items: answer.unsupported });
      else done({ kind: "syntax", items: answer.errors });
    } catch {
      done({ kind: "failed" });
    } finally {
      if (inFlight.current === code) inFlight.current = null;
    }
  }, []);

  const applyRules = useCallback(
    (rules: NotificationRules) => {
      ++request.current;
      inFlight.current = null;
      const checked = notificationRulesSchema.safeParse(rules);
      if (!checked.success) {
        const errors = checked.error.issues.map((issue) => {
          const at = issue.path[0] === "rules" && typeof issue.path[1] === "number" ? `Rule ${issue.path[1] + 1}: ` : "";
          return `${at}${issue.message}`;
        });
        setResult((current) => ({ code: current?.code ?? code, parsed: { kind: "rules", rules, errors, rewritesCode: false } }));
        return;
      }
      const next = generateNotificationCode(checked.data);
      setCode(next);
      setResult({ code: next, parsed: { kind: "rules", rules: canonicalizeNotificationRules(checked.data), errors: [], rewritesCode: false } });
    },
    [code, setCode]
  );

  const replaceWithDefault = useCallback(() => {
    ++request.current;
    inFlight.current = null;
    setCode(DEFAULT_CODE);
    setResult({ code: DEFAULT_CODE, parsed: { kind: "rules", rules: DEFAULT_NOTIFICATION_RULES, errors: [], rewritesCode: false } });
  }, [setCode]);

  const state: RulesSync = result && result.code === code ? result.parsed : { kind: "loading" };
  return { state, ensureParsed, applyRules, replaceWithDefault };
}
