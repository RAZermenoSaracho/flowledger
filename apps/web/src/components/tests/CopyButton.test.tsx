import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyButton } from "../CopyButton";

function mockClipboard(writeText: () => Promise<void>) {
  const spy = vi.fn(writeText);
  Object.defineProperty(navigator, "clipboard", { value: { writeText: spy }, configurable: true });
  return spy;
}

describe("CopyButton", () => {
  afterEach(() => vi.restoreAllMocks());

  it("copies the value and announces Copied", async () => {
    const user = userEvent.setup();
    const spy = mockClipboard(() => Promise.resolve());
    render(<CopyButton value="abc" label="Copy MCP URL" />);
    await user.click(screen.getByRole("button", { name: "Copy MCP URL" }));
    expect(spy).toHaveBeenCalledWith("abc");
    expect(screen.getByRole("status")).toHaveTextContent("Copied");
  });

  it("announces a manual-copy fallback when the write fails", async () => {
    const user = userEvent.setup();
    mockClipboard(() => Promise.reject(new Error("denied")));
    render(<CopyButton value="abc" label="Copy" />);
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(screen.getByRole("status")).toHaveTextContent("Copy failed — select and copy manually");
  });
});
