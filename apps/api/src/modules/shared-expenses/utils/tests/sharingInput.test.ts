import { describe, expect, it } from "vitest";
import { legacyParticipantsToSharing } from "../sharingInput.js";

describe("legacyParticipantsToSharing", () => {
  it("maps app users by id, manual ones by name, and drops payment fields", () => {
    expect(
      legacyParticipantsToSharing([
        { userId: "u1", participantName: "Stale", shareAmount: "10", paidAmount: "10", status: "paid" },
        { participantName: "Cash", shareAmount: "5", paidAmount: "0", status: "pending" }
      ])
    ).toEqual([
      { userId: "u1", share: "10" },
      { manualName: "Cash", share: "5" }
    ]);
  });
});
