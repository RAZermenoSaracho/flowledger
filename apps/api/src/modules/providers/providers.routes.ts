import { institutionCatalogQuerySchema } from "@flowledger/shared";
import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import type { ProviderInstitution } from "./provider.types.js";
import { listProviders } from "./providerRegistry.js";

export const providersRouter = Router();

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

function filterInstitutions(
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

providersRouter.get(
  "/institutions",
  validate(institutionCatalogQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const providers = listProviders().filter(
      (provider) => provider.listInstitutions
    );

    const institutions = (
      await Promise.all(
        providers.map((provider) => provider.listInstitutions!())
      )
    ).flat();

    res.json({
      institutions: filterInstitutions(
        institutions,
        req.query as InstitutionCatalogQuery
      )
    });
  })
);
