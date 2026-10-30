import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConnectClientSection } from "../ConnectClientSection";

describe("ConnectClientSection", () => {
  it("shows ChatGPT steps, the Claude Code commands and no availability note", () => {
    render(<ConnectClientSection />);
    expect(screen.getByText(/claude mcp add --transport http flowledger http:\/\/localhost:4000\/mcp$/)).toBeInTheDocument();
    expect(screen.getByText(/--header "Authorization: Bearer fl_\.\.\."/)).toBeInTheDocument();
    expect(screen.getByText(/Developer mode \(Settings → Apps → Advanced settings\)/)).toBeInTheDocument();
    expect(screen.getByText("http://localhost:4000/mcp")).toBeInTheDocument();
    expect(screen.getByText(/consent page/)).toBeInTheDocument();
    expect(screen.getByText("/mcp")).toBeInTheDocument();
    expect(screen.queryByText(/MCP server ships/)).not.toBeInTheDocument();
  });
});
