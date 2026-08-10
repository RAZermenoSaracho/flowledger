import type { ProviderConnector, ProviderInstitution } from "../types/provider.types.js";
import { listProviders } from "./providerRegistry.js";

type InstitutionCatalogQuery = {
  q?: string;
  provider?: string;
  country?: string;
  category?: string;
};

function matchesSearch(institution: ProviderInstitution, query: string) {
  const haystack = [
    institution.name,
    institution.country,
    institution.category,
    ...institution.supportedAccountTypes
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

/** Filters and sorts institutions by provider/country/category/free-text query, all filters combined with AND. */
export function filterInstitutions(
  institutions: ProviderInstitution[],
  filters: InstitutionCatalogQuery
) {
  return institutions
    .filter((institution) =>
      filters.provider ? institution.provider === filters.provider : true
    )
    .filter((institution) =>
      filters.country
        ? institution.country?.toLowerCase() === filters.country.toLowerCase()
        : true
    )
    .filter((institution) =>
      filters.category ? institution.category === filters.category : true
    )
    .filter((institution) =>
      filters.q ? matchesSearch(institution, filters.q) : true
    )
    .sort((left, right) => left.name.localeCompare(right.name));
}

/** Aggregates institutions from every registered provider that implements `listInstitutions`. */
export async function listAvailableInstitutions() {
  const providers = listProviders().filter(
    (provider) => provider.listInstitutions
  );

  return (
    await Promise.all(providers.map((provider) => provider.listInstitutions!()))
  ).flat();
}

/** Aggregates connectors from every registered provider that implements `listConnectors`. */
export async function listAvailableConnectors() {
  const providers = listProviders().filter(
    (provider) => provider.listConnectors
  );

  return (
    await Promise.all(providers.map((provider) => provider.listConnectors!()))
  ).flat();
}

/** Finds one institution by id, optionally also constrained to a specific provider. */
export function findSelectedInstitution(
  institutions: ProviderInstitution[],
  filters: { provider?: string; institutionId: string }
) {
  return institutions.find(
    (institution) =>
      institution.institutionId === filters.institutionId &&
      (filters.provider ? institution.provider === filters.provider : true)
  );
}

/** Finds the connector for a given provider. */
export function findSelectedConnector(
  connectors: ProviderConnector[],
  filters: { provider: string }
) {
  return connectors.find(
    (connector) => connector.provider === filters.provider
  );
}
