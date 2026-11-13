import { describe, expect, it } from "vitest";
import type { NotificationModelDraft } from "../../types/notificationModels.types";
import { validateNotificationModelDraft } from "../modelValidation";

const base: NotificationModelDraft = {
  name: "Plata",
  description: "",
  code: "",
  isActive: false,
  visibility: "private",
  slots: [{ key: "card", kind: "account", label: "Card", required: true }],
  bindings: {},
  settings: {}
};

describe("validateNotificationModelDraft", () => {
  it("accepts a valid draft", () => {
    expect(validateNotificationModelDraft(base)).toEqual({});
  });

  it("rejects a blank name, bad or duplicate slot keys and unlabeled slots", () => {
    expect(validateNotificationModelDraft({ ...base, name: " " }).name).toBeDefined();
    expect(validateNotificationModelDraft({ ...base, slots: [{ ...base.slots[0]!, key: "Bad Key" }] }).slots).toMatch(/lowercase/);
    expect(validateNotificationModelDraft({ ...base, slots: [base.slots[0]!, base.slots[0]!] }).slots).toMatch(/unique/);
    expect(validateNotificationModelDraft({ ...base, slots: [{ ...base.slots[0]!, label: " " }] }).slots).toMatch(/label/);
  });

  it("rejects an empty setting name", () => {
    expect(validateNotificationModelDraft({ ...base, settings: { "": "x" } }).settings).toBeDefined();
  });
});
