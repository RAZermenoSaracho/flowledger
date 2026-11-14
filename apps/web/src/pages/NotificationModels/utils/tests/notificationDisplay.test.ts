import { describe, expect, it } from "vitest";
import { formatDuration, runStatusLabel } from "../notificationDisplay";

describe("notificationDisplay", () => {
  it("formats durations as their two largest units", () => {
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(125_000)).toBe("2m 5s");
    expect(formatDuration(2 * 3600_000 + 5 * 60_000)).toBe("2h 5m");
    expect(formatDuration(3600_000)).toBe("1h");
    expect(formatDuration(-5)).toBe("0s");
  });

  it("labels statuses", () => {
    expect(runStatusLabel("queued")).toBe("Queued");
    expect(runStatusLabel(null)).toBe("No runs yet");
  });
});
