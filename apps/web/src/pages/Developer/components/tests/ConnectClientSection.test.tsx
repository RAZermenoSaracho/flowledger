import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConnectClientSection } from "../ConnectClientSection";

describe("ConnectClientSection", () => {
  it("shows both mcp add commands and the availability note", () => {
    render(<ConnectClientSection />);
    expect(screen.getByText(/claude mcp add --transport http flowledger http:\/\/localhost:4000\/mcp$/)).toBeInTheDocument();
    expect(screen.getByText(/--header "Authorization: Bearer fl_\.\.\."/)).toBeInTheDocument();
    expect(screen.getByText(/when the MCP server ships/)).toBeInTheDocument();
  });
});
