import { beforeEach, describe, expect, it, vi } from "vitest";
import { listProviders } from "../providerRegistry.js";
import {
  filterInstitutions,
  findSelectedConnector,
  findSelectedInstitution,
  listAvailableConnectors,
  listAvailableInstitutions
} from "../institutionCatalog.js";

vi.mock("../providerRegistry.js", () => ({
  listProviders: vi.fn()
}));

const listProvidersMock = vi.mocked(listProviders);

const institutions = [
  {
    provider: "syncfy",
    institutionId: "bbva",
    name: "BBVA",
    country: "MX",
    category: "bank",
    supportedAccountTypes: ["checking", "savings"]
  },
  {
    provider: "syncfy",
    institutionId: "chase",
    name: "Chase",
    country: "US",
    category: "bank",
    supportedAccountTypes: ["checking"]
  },
  {
    provider: "other",
    institutionId: "coinbase",
    name: "Coinbase",
    country: "US",
    category: "exchange",
    supportedAccountTypes: ["wallet"]
  }
];

describe("filterInstitutions", () => {
  it("filters by provider", () => {
    const result = filterInstitutions(institutions as never, { provider: "other" });
    expect(result.map((i) => i.institutionId)).toEqual(["coinbase"]);
  });

  it("filters by country, case-insensitively", () => {
    const result = filterInstitutions(institutions as never, { country: "mx" });
    expect(result.map((i) => i.institutionId)).toEqual(["bbva"]);
  });

  it("filters by category", () => {
    const result = filterInstitutions(institutions as never, { category: "exchange" });
    expect(result.map((i) => i.institutionId)).toEqual(["coinbase"]);
  });

  it("filters by free-text query across name/country/category/account types", () => {
    const result = filterInstitutions(institutions as never, { q: "checking" });
    expect(result.map((i) => i.institutionId).sort()).toEqual(["bbva", "chase"]);
  });

  it("combines multiple filters with AND", () => {
    const result = filterInstitutions(institutions as never, {
      category: "bank",
      country: "US"
    });
    expect(result.map((i) => i.institutionId)).toEqual(["chase"]);
  });

  it("sorts results alphabetically by name", () => {
    const result = filterInstitutions(institutions as never, {});
    expect(result.map((i) => i.name)).toEqual(["BBVA", "Chase", "Coinbase"]);
  });
});

describe("findSelectedInstitution", () => {
  it("finds by institutionId", () => {
    expect(
      findSelectedInstitution(institutions as never, { institutionId: "chase" })
        ?.name
    ).toBe("Chase");
  });

  it("also constrains by provider when given", () => {
    expect(
      findSelectedInstitution(institutions as never, {
        institutionId: "chase",
        provider: "other"
      })
    ).toBeUndefined();
  });
});

describe("findSelectedConnector", () => {
  it("finds a connector by provider", () => {
    const connectors = [{ provider: "syncfy" }, { provider: "other" }];
    expect(findSelectedConnector(connectors as never, { provider: "other" })).toEqual(
      { provider: "other" }
    );
  });

  it("returns undefined when no connector matches", () => {
    const connectors = [{ provider: "syncfy" }];
    expect(
      findSelectedConnector(connectors as never, { provider: "missing" })
    ).toBeUndefined();
  });
});

describe("listAvailableInstitutions", () => {
  beforeEach(() => listProvidersMock.mockReset());

  it("aggregates institutions from every provider implementing listInstitutions", async () => {
    listProvidersMock.mockReturnValue([
      { listInstitutions: vi.fn().mockResolvedValue([{ institutionId: "a" }]) },
      { listInstitutions: vi.fn().mockResolvedValue([{ institutionId: "b" }]) }
    ] as never);

    const result = await listAvailableInstitutions();
    expect(result).toEqual([{ institutionId: "a" }, { institutionId: "b" }]);
  });

  it("skips providers that don't implement listInstitutions", async () => {
    listProvidersMock.mockReturnValue([
      { listInstitutions: vi.fn().mockResolvedValue([{ institutionId: "a" }]) },
      {}
    ] as never);

    const result = await listAvailableInstitutions();
    expect(result).toEqual([{ institutionId: "a" }]);
  });
});

describe("listAvailableConnectors", () => {
  beforeEach(() => listProvidersMock.mockReset());

  it("aggregates connectors from every provider implementing listConnectors", async () => {
    listProvidersMock.mockReturnValue([
      { listConnectors: vi.fn().mockResolvedValue([{ provider: "syncfy" }]) }
    ] as never);

    const result = await listAvailableConnectors();
    expect(result).toEqual([{ provider: "syncfy" }]);
  });
});
