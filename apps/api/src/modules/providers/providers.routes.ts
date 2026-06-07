import {
  createProviderConnectionSchema,
  institutionCatalogQuerySchema
} from "@flowledger/shared";
import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError } from "../../utils/httpError.js";
import type { ProviderInstitution } from "./provider.types.js";
import { getProvider, listProviders } from "./providerRegistry.js";

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

async function listAvailableInstitutions() {
  const providers = listProviders().filter(
    (provider) => provider.listInstitutions
  );

  return (
    await Promise.all(providers.map((provider) => provider.listInstitutions!()))
  ).flat();
}

function findSelectedInstitution(
  institutions: ProviderInstitution[],
  filters: { provider?: string; institutionId: string }
) {
  return institutions.find(
    (institution) =>
      institution.institutionId === filters.institutionId &&
      (filters.provider ? institution.provider === filters.provider : true)
  );
}

providersRouter.get(
  "/institutions",
  validate(institutionCatalogQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const institutions = await listAvailableInstitutions();

    res.json({
      institutions: filterInstitutions(
        institutions,
        req.query as InstitutionCatalogQuery
      )
    });
  })
);

providersRouter.post(
  "/connections",
  validate(createProviderConnectionSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new HttpError(401, "Authentication required");
    }

    const { institutionId, provider: providerKey } = req.body as {
      institutionId: string;
      provider?: string;
    };
    const institutions = await listAvailableInstitutions();
    const institution = findSelectedInstitution(institutions, {
      institutionId,
      provider: providerKey
    });

    if (!institution) {
      throw new HttpError(404, "Institution is not available");
    }

    const provider = getProvider(institution.provider);
    const flowInput = {
      providerUserId: userId,
      externalUserId: userId,
      institutionId: institution.institutionId,
      metadata: { institution }
    };
    const flow = provider.createConnectionFlow
      ? await provider.createConnectionFlow(flowInput)
      : provider.createSession
        ? await provider.createSession(flowInput)
        : undefined;

    if (!flow) {
      throw new HttpError(501, "Institution connection is not configured");
    }

    res.status(201).json({
      connection: {
        provider: flow.provider,
        institutionId: institution.institutionId,
        institutionName: institution.name,
        flowId: "flowId" in flow ? flow.flowId : undefined,
        token: flow.token,
        url: "url" in flow ? flow.url : undefined,
        widget: "widget" in flow ? flow.widget : undefined
      }
    });
  })
);
