import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "../useTheme";

const storageKey = "flowledger.theme";

function makeMatchMedia(matches: boolean) {
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  const matchMedia = vi.fn().mockReturnValue({
    matches,
    media: "(prefers-color-scheme: dark)",
    addEventListener,
    removeEventListener
  });
  return { matchMedia, addEventListener, removeEventListener };
}

function Consumer() {
  const { preference, setPreference } = useTheme();
  return (
    <div>
      <span data-testid="preference">{preference}</span>
      <button onClick={() => setPreference("dark")}>Dark</button>
      <button onClick={() => setPreference("light")}>Light</button>
      <button onClick={() => setPreference("system")}>System</button>
    </div>
  );
}

describe("useTheme", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("throws when used outside ThemeProvider", () => {
    window.matchMedia = makeMatchMedia(false).matchMedia;
    expect(() => render(<Consumer />)).toThrow(
      "useTheme must be used within ThemeProvider"
    );
  });

  it("defaults to 'system' when nothing is stored", () => {
    window.matchMedia = makeMatchMedia(false).matchMedia;
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    );
    expect(screen.getByTestId("preference")).toHaveTextContent("system");
  });

  it("restores a previously stored preference", () => {
    window.matchMedia = makeMatchMedia(false).matchMedia;
    window.localStorage.setItem(storageKey, "dark");

    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId("preference")).toHaveTextContent("dark");
  });

  it("ignores an invalid stored value and falls back to 'system'", () => {
    window.matchMedia = makeMatchMedia(false).matchMedia;
    window.localStorage.setItem(storageKey, "not-a-real-theme");

    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId("preference")).toHaveTextContent("system");
  });

  it("applies the dark class for an explicit 'dark' preference", () => {
    window.matchMedia = makeMatchMedia(false).matchMedia;
    window.localStorage.setItem(storageKey, "dark");

    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    );

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("applies the dark class for 'system' when the OS prefers dark", () => {
    window.matchMedia = makeMatchMedia(true).matchMedia;

    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    );

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("does not apply the dark class for 'system' when the OS prefers light", () => {
    window.matchMedia = makeMatchMedia(false).matchMedia;

    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    );

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("setPreference updates state and persists to localStorage", async () => {
    window.matchMedia = makeMatchMedia(false).matchMedia;
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    );

    await user.click(screen.getByRole("button", { name: "Dark" }));

    expect(screen.getByTestId("preference")).toHaveTextContent("dark");
    expect(window.localStorage.getItem(storageKey)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("registers a media-query change listener only while preference is 'system'", async () => {
    const { matchMedia, addEventListener, removeEventListener } = makeMatchMedia(false);
    window.matchMedia = matchMedia;
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    );

    expect(addEventListener).toHaveBeenCalledWith("change", expect.any(Function));

    await user.click(screen.getByRole("button", { name: "Dark" }));

    expect(removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
