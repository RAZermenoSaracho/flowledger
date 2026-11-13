import { canonicalizeNotificationRules, DEFAULT_NOTIFICATION_RULES, generateNotificationCode, type NotificationRules } from "@flowledger/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HttpResponse, http } from "msw";
import { useState, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { useRulesSync } from "../useRulesSync";

const API = "http://localhost:4000";
const CUSTOM = "def process(text, ctx):\n    # custom\n    return skip('x')\n";

function useHarness(initial: string) {
  const [code, setCode] = useState(initial);
  return { code, ...useRulesSync(code, setCode), setCode };
}
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;

describe("useRulesSync", () => {
  it("shows the default rules without calling the server and never writes code", async () => {
    const code = generateNotificationCode(DEFAULT_NOTIFICATION_RULES);
    const { result } = renderHook(() => useHarness(code), { wrapper });
    await act(() => result.current.ensureParsed());
    expect(result.current.state).toMatchObject({ kind: "rules", rewritesCode: false });
    expect(result.current.code).toBe(code);
  });

  it("flags non-canonical parsed code and rewrites it on the first valid edit", async () => {
    server.use(http.post(`${API}/notification-models/parse-rules`, () => HttpResponse.json({ rules: DEFAULT_NOTIFICATION_RULES })));
    const { result } = renderHook(() => useHarness(CUSTOM), { wrapper });
    expect(result.current.state.kind).toBe("loading");
    await act(() => result.current.ensureParsed());
    expect(result.current.state).toMatchObject({ kind: "rules", rewritesCode: true });
    expect(result.current.code).toBe(CUSTOM);
    act(() => result.current.applyRules({ ...DEFAULT_NOTIFICATION_RULES, fallbackReason: "other" }));
    expect(result.current.code).toContain('return skip("other")');
    expect(result.current.state).toMatchObject({ kind: "rules", rewritesCode: false });
  });

  it("stores valid edits in canonical form without changing generated code", async () => {
    const { result } = renderHook(() => useHarness(generateNotificationCode(DEFAULT_NOTIFICATION_RULES)), { wrapper });
    await act(() => result.current.ensureParsed());
    const edited: NotificationRules = {
      ...DEFAULT_NOTIFICATION_RULES,
      rules: [{ ...DEFAULT_NOTIFICATION_RULES.rules[0]!, match: "any", conditions: [{ kind: "not_contains", text: "PROMO", ignoreCase: true }] }]
    };
    act(() => result.current.applyRules(edited));
    expect(result.current.state).toMatchObject({ kind: "rules", rules: canonicalizeNotificationRules(edited), errors: [] });
    expect(result.current.code).toBe(generateNotificationCode(edited));
    await act(() => result.current.ensureParsed());
    expect(result.current.state).toMatchObject({ rules: canonicalizeNotificationRules(edited) });
    expect(edited.rules[0]!.conditions[0]).toMatchObject({ text: "PROMO" });
  });

  it("keeps the code when an edit is invalid and reports the problem", async () => {
    const code = generateNotificationCode(DEFAULT_NOTIFICATION_RULES);
    const { result } = renderHook(() => useHarness(code), { wrapper });
    await act(() => result.current.ensureParsed());
    act(() => result.current.applyRules({ ...DEFAULT_NOTIFICATION_RULES, fallbackReason: "" }));
    expect(result.current.code).toBe(code);
    expect(result.current.state).toMatchObject({ kind: "rules", errors: [expect.any(String)] });
  });

  it.each(["valid edit", "invalid edit", "default replacement"])("ignores a parse resolving after %s", async (edit) => {
    let respond!: () => void;
    const responseReady = new Promise<void>((resolve) => { respond = resolve; });
    let started!: () => void;
    const requestStarted = new Promise<void>((resolve) => { started = resolve; });
    server.use(http.post(`${API}/notification-models/parse-rules`, async () => {
      started();
      await responseReady;
      return HttpResponse.json({ rules: DEFAULT_NOTIFICATION_RULES });
    }));
    const { result } = renderHook(() => useHarness(CUSTOM), { wrapper });
    let pending!: Promise<void>;
    act(() => { pending = result.current.ensureParsed(); });
    await requestStarted;
    act(() => {
      if (edit === "default replacement") result.current.replaceWithDefault();
      else result.current.applyRules({ ...DEFAULT_NOTIFICATION_RULES, fallbackReason: edit === "valid edit" ? "edited" : "" });
    });
    const editedState = result.current.state;
    const editedCode = result.current.code;
    await act(async () => {
      respond();
      await pending;
    });
    expect(result.current.state).toEqual(editedState);
    expect(result.current.code).toBe(editedCode);
    expect(result.current.state.kind).toBe("rules");
  });

  it("reports unsupported constructs, syntax errors and a busy sandbox", async () => {
    const { result } = renderHook(() => useHarness(CUSTOM), { wrapper });
    server.use(http.post(`${API}/notification-models/parse-rules`, () => HttpResponse.json({ unsupported: [{ line: 2, message: "loop" }] })));
    await act(() => result.current.ensureParsed());
    expect(result.current.state).toEqual({ kind: "unsupported", items: [{ line: 2, message: "loop" }] });
    server.use(http.post(`${API}/notification-models/parse-rules`, () => HttpResponse.json({ errors: [{ line: 1, col: 1, message: "bad" }] })));
    act(() => result.current.setCode("def (:"));
    await act(() => result.current.ensureParsed());
    await waitFor(() => expect(result.current.state.kind).toBe("syntax"));
    server.use(http.post(`${API}/notification-models/parse-rules`, () => HttpResponse.json({ message: "busy" }, { status: 503 })));
    act(() => result.current.setCode(CUSTOM));
    await act(() => result.current.ensureParsed());
    await waitFor(() => expect(result.current.state.kind).toBe("failed"));
  });

  it("sends one parse request when asked twice for the same code at once", async () => {
    let calls = 0;
    server.use(
      http.post(`${API}/notification-models/parse-rules`, async () => {
        calls += 1;
        if (calls > 1) return HttpResponse.json({ message: "busy" }, { status: 503 });
        await new Promise((resolve) => setTimeout(resolve, 20));
        return HttpResponse.json({ unsupported: [{ line: 2, message: "loop" }] });
      })
    );
    const { result } = renderHook(() => useHarness(CUSTOM), { wrapper });
    await act(() => Promise.all([result.current.ensureParsed(), result.current.ensureParsed()]));
    expect(calls).toBe(1);
    expect(result.current.state.kind).toBe("unsupported");
  });

  it("replaces the whole script with the default rules", async () => {
    const { result } = renderHook(() => useHarness(CUSTOM), { wrapper });
    act(() => result.current.replaceWithDefault());
    expect(result.current.code).toBe(generateNotificationCode(DEFAULT_NOTIFICATION_RULES));
    expect(result.current.state.kind).toBe("rules");
  });
});
