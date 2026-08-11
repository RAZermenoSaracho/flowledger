import { describe, expect, it } from "vitest";
import {
  confirmProviderAccountsSchema,
  createProviderConnectionSchema,
  institutionCatalogQuerySchema,
  providerConnectionParamsSchema,
  providerWebhookParamsSchema
} from "../providers.js";

describe("institutionCatalogQuerySchema", () => {
  it("accepts an empty object (all fields optional)", () => {
    expect(institutionCatalogQuerySchema.safeParse({}).success).toBe(true);
  });

  it("accepts a known category", () => {
    expect(
      institutionCatalogQuerySchema.safeParse({ category: "bank" }).success
    ).toBe(true);
  });

  it("rejects an unknown category", () => {
    expect(
      institutionCatalogQuerySchema.safeParse({ category: "crypto" }).success
    ).toBe(false);
  });
});

describe("createProviderConnectionSchema", () => {
  it("accepts an institutionId alone", () => {
    expect(
      createProviderConnectionSchema.safeParse({ institutionId: "inst-1" })
        .success
    ).toBe(true);
  });

  it("accepts a provider alone", () => {
    expect(
      createProviderConnectionSchema.safeParse({ provider: "syncfy" }).success
    ).toBe(true);
  });

  it("rejects an object with neither institutionId nor provider", () => {
    expect(createProviderConnectionSchema.safeParse({}).success).toBe(false);
  });
});

describe("providerConnectionParamsSchema", () => {
  it("accepts a non-empty id", () => {
    expect(
      providerConnectionParamsSchema.safeParse({ id: "conn-1" }).success
    ).toBe(true);
  });

  it("rejects an empty id", () => {
    expect(providerConnectionParamsSchema.safeParse({ id: "" }).success).toBe(
      false
    );
  });
});

describe("confirmProviderAccountsSchema", () => {
  it("accepts a non-empty accounts array", () => {
    expect(
      confirmProviderAccountsSchema.safeParse({
        accounts: [{ providerAccountId: "pa-1" }]
      }).success
    ).toBe(true);
  });

  it("rejects an empty accounts array", () => {
    expect(
      confirmProviderAccountsSchema.safeParse({ accounts: [] }).success
    ).toBe(false);
  });

  it("rejects more than 50 accounts", () => {
    const accounts = Array.from({ length: 51 }, (_, index) => ({
      providerAccountId: `pa-${index}`
    }));
    expect(
      confirmProviderAccountsSchema.safeParse({ accounts }).success
    ).toBe(false);
  });
});

describe("providerWebhookParamsSchema", () => {
  it("accepts a non-empty provider", () => {
    expect(
      providerWebhookParamsSchema.safeParse({ provider: "syncfy" }).success
    ).toBe(true);
  });

  it("rejects an empty provider", () => {
    expect(providerWebhookParamsSchema.safeParse({ provider: "" }).success).toBe(
      false
    );
  });
});
