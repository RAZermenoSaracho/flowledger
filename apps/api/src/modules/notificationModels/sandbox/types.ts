/** One AST-allowlist violation or syntax error, with 1-based line and 0-based column. */
export interface ScriptValidationError {
  line: number;
  col: number;
  message: string;
}

/** Request line sent to the sandbox child. */
export type SandboxRequest =
  | {
      mode: "run";
      code: string;
      text: string;
      ctx: { received_at: string; settings: Record<string, string> };
    }
  | { mode: "validate"; code: string }
  | { mode: "parse"; code: string };

/** Response of a `run`; proposal fields mirror the helper arguments (snake_case slot keys). */
export type SandboxResult =
  | { kind: "proposal"; proposal: { kind: "expense" | "income" | "transfer" } & Record<string, string>; stdout: string }
  | { kind: "skip"; reason: string; stdout: string }
  | { kind: "error"; error: { message: string; line?: number | null }; stdout: string };
