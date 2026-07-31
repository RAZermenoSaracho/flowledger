import {
  confirmProviderAccountsSchema,
  createProviderConnectionSchema,
  institutionCatalogQuerySchema,
  providerConnectionParamsSchema
} from "@flowledger/shared";
import { AccountType, Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError } from "../../utils/httpError.js";
import { serialize } from "../../utils/serialize.js";
import type {
  ProviderConnector,
  ProviderInstitution
} from "./provider.types.js";
import { getProvider, listProviders } from "./providerRegistry.js";
import {
  getManualSyncfyRefreshRetryDelaysMs,
  resyncSyncfyConnection,
  resyncSyncfyCredential
} from "./syncfy/syncfy.service.js";

export const providersRouter = Router();

type InstitutionCatalogQuery = {
  q?: string;
  provider?: string;
  country?: string;
  category?: string;
};

const providerCredentialParamsSchema = z.object({
  providerCredentialId: z.string().min(1)
});

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

async function listAvailableConnectors() {
  const providers = listProviders().filter(
    (provider) => provider.listConnectors
  );

  return (
    await Promise.all(providers.map((provider) => provider.listConnectors!()))
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

function findSelectedConnector(
  connectors: ProviderConnector[],
  filters: { provider: string }
) {
  return connectors.find(
    (connector) => connector.provider === filters.provider
  );
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function getNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function normalizeAccountType(value: unknown): AccountType {
  const rawType = getString(value)?.toLowerCase() ?? "";
  if (/credit|card|tarjeta/.test(rawType)) return AccountType.credit_card;
  if (/saving|ahorro/.test(rawType)) return AccountType.savings;
  if (/checking|debit|bank|cuenta/.test(rawType)) return AccountType.checking;
  if (/broker|invest|inversion/.test(rawType)) return AccountType.investment;
  if (/cash|efectivo/.test(rawType)) return AccountType.cash;

  return AccountType.other;
}

function providerAccountSummary(
  providerAccount: Prisma.ProviderAccountGetPayload<{
    include: { account: true; connection: true };
  }>
) {
  const metadata = getRecord(providerAccount.accountMetadata);

  return {
    id: providerAccount.id,
    provider: providerAccount.provider,
    institutionName: providerAccount.connection?.institutionName ?? null,
    name: getString(metadata.name) ?? "Imported account",
    type: normalizeAccountType(metadata.type),
    providerType: getString(metadata.type) ?? null,
    currency: getString(metadata.currency) ?? null,
    balance: getNumber(metadata.balance) ?? null,
    status: providerAccount.status,
    failureReason: providerAccount.failureReason,
    requiresManualReconnect: providerAccount.requiresManualReconnect,
    lastSyncAt: providerAccount.lastSyncAt,
    lastSyncSuccessAt: providerAccount.lastSyncSuccessAt,
    lastSyncFailureAt: providerAccount.lastSyncFailureAt,
    connectionStatus: providerAccount.connection?.status ?? null,
    connectionFailureReason: providerAccount.connection?.failureReason ?? null,
    connectionRequiresManualReconnect:
      providerAccount.connection?.requiresManualReconnect ?? false,
    linkedAccountId: providerAccount.accountId,
    linkedAccount: providerAccount.account
      ? {
          id: providerAccount.account.id,
          name: providerAccount.account.name,
          type: providerAccount.account.type
        }
      : null,
    createdAt: providerAccount.createdAt,
    updatedAt: providerAccount.updatedAt
  };
}

async function assertUserAccount(userId: string, accountId: string) {
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId },
    select: { id: true }
  });

  if (!account) {
    throw new HttpError(404, "FlowLedger account was not found");
  }
}

async function createOrLinkProviderAccount(input: {
  userId: string;
  providerAccountId: string;
  accountId?: string;
}) {
  const providerAccount = await prisma.providerAccount.findFirst({
    where: {
      id: input.providerAccountId,
      userId: input.userId
    },
    include: {
      account: true,
      connection: true
    }
  });

  if (!providerAccount) {
    throw new HttpError(404, "Imported provider account was not found");
  }

  if (providerAccount.accountId) return providerAccount;

  if (input.accountId) {
    await assertUserAccount(input.userId, input.accountId);

    return prisma.providerAccount.update({
      where: { id: providerAccount.id },
      data: { accountId: input.accountId },
      include: { account: true, connection: true }
    });
  }

  const metadata = getRecord(providerAccount.accountMetadata);
  const account = await prisma.account.create({
    data: {
      userId: input.userId,
      name: getString(metadata.name) ?? "Synced account",
      type: normalizeAccountType(metadata.type),
      identifier: null,
      currency: getString(metadata.currency)?.toUpperCase() ?? "USD",
      initialBalance: new Prisma.Decimal(getNumber(metadata.balance) ?? 0)
    }
  });

  return prisma.providerAccount.update({
    where: { id: providerAccount.id },
    data: { accountId: account.id },
    include: { account: true, connection: true }
  });
}

providersRouter.get(
  "/connectors",
  asyncHandler(async (_req, res) => {
    const connectors = await listAvailableConnectors();

    res.json({
      connectors: connectors.map(
        ({ metadata: _metadata, ...connector }) => connector
      )
    });
  })
);

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
      institutionId?: string;
      provider?: string;
    };
    const institution = institutionId
      ? findSelectedInstitution(await listAvailableInstitutions(), {
          institutionId,
          provider: providerKey
        })
      : undefined;

    if (institutionId && !institution) {
      throw new HttpError(404, "Institution is not available");
    }

    const connector =
      !institution && providerKey
        ? findSelectedConnector(await listAvailableConnectors(), {
            provider: providerKey
          })
        : undefined;

    if (!institution && !connector) {
      throw new HttpError(404, "Connector is not available");
    }

    const provider = getProvider((institution ?? connector)!.provider);
    const flowInput = {
      providerUserId: userId,
      externalUserId: userId,
      institutionId: institution?.institutionId,
      metadata: institution ? { institution } : { connector }
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
        connectorId: connector?.connectorId,
        institutionId: institution?.institutionId,
        institutionName: institution?.name ?? connector!.title,
        flowId: "flowId" in flow ? flow.flowId : undefined,
        token: flow.token,
        url: "url" in flow ? flow.url : undefined,
        widget: "widget" in flow ? flow.widget : undefined
      }
    });
  })
);

providersRouter.get(
  "/connections/:id/status",
  validate(providerConnectionParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new HttpError(401, "Authentication required");
    }

    const connection = await prisma.providerConnection.findFirst({
      where: {
        id: req.params.id,
        userId
      },
      include: {
        _count: {
          select: {
            accounts: true,
            importedTransactions: true
          }
        }
      }
    });

    if (!connection) {
      throw new HttpError(404, "Provider connection was not found");
    }

    const latestWebhookEvent = await prisma.providerWebhookEvent.findFirst({
      where: {
        provider: connection.provider,
        providerCredentialId: connection.providerCredentialId
      },
      orderBy: { receivedAt: "desc" },
      select: {
        id: true,
        eventName: true,
        status: true,
        errorMessage: true,
        receivedAt: true,
        processedAt: true
      }
    });

    res.json({
      connection: serialize({
        id: connection.id,
        provider: connection.provider,
        institutionId: connection.institutionId,
        institutionName: connection.institutionName,
        status: connection.status,
        failureReason: connection.failureReason,
        requiresManualReconnect: connection.requiresManualReconnect,
        lastSyncAt: connection.lastSyncAt,
        lastSyncSuccessAt: connection.lastSyncSuccessAt,
        lastSyncFailureAt: connection.lastSyncFailureAt,
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
        accountsCount: connection._count.accounts,
        importedTransactionsCount: connection._count.importedTransactions,
        latestWebhookEvent
      })
    });
  })
);

providersRouter.post(
  "/connections/:id/resync",
  validate(providerConnectionParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new HttpError(401, "Authentication required");
    }

    const connection = await prisma.providerConnection.findFirst({
      where: {
        id: req.params.id,
        userId
      }
    });

    if (!connection) {
      throw new HttpError(404, "Provider connection was not found");
    }

    if (connection.provider !== "syncfy") {
      throw new HttpError(501, "Provider resync is not configured");
    }

    const result = await resyncSyncfyConnection({
      userId,
      connectionId: connection.id,
      retryDelaysMs: getManualSyncfyRefreshRetryDelaysMs()
    });

    res.json({ resync: serialize(result) });
  })
);

providersRouter.post(
  "/syncfy/credentials/:providerCredentialId/refresh",
  validate(providerCredentialParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new HttpError(401, "Authentication required");
    }
    const providerCredentialId = req.params.providerCredentialId;
    if (!providerCredentialId) {
      throw new HttpError(400, "Provider credential id is required");
    }

    console.info("[SYNCFY REFRESH] Manual credential refresh requested", {
      providerCredentialId,
      userId
    });

    const result = await resyncSyncfyCredential({
      userId,
      providerCredentialId,
      retryDelaysMs: getManualSyncfyRefreshRetryDelaysMs()
    });

    res.json({ refresh: serialize(result) });
  })
);

providersRouter.get(
  "/accounts",
  asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new HttpError(401, "Authentication required");
    }

    const accounts = await prisma.providerAccount.findMany({
      where: {
        userId,
        ...(req.query.status === "unlinked" ? { accountId: null } : {})
      },
      include: {
        account: true,
        connection: true
      },
      orderBy: { createdAt: "desc" },
      take: 50
    });

    res.json({
      accounts: serialize(accounts.map(providerAccountSummary))
    });
  })
);

providersRouter.post(
  "/accounts/:id/resync",
  asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new HttpError(401, "Authentication required");
    }

    const providerAccount = await prisma.providerAccount.findFirst({
      where: {
        id: req.params.id,
        userId,
        accountId: { not: null }
      },
      include: { connection: true }
    });

    if (!providerAccount) {
      throw new HttpError(404, "Synced account was not found");
    }
    if (!providerAccount.connection) {
      throw new HttpError(409, "Synced account is missing a connection");
    }

    if (providerAccount.provider !== "syncfy") {
      throw new HttpError(501, "Provider resync is not configured");
    }

    const result = await resyncSyncfyConnection({
      userId,
      connectionId: providerAccount.connection.id,
      retryDelaysMs: getManualSyncfyRefreshRetryDelaysMs()
    });

    res.json({ resync: serialize(result) });
  })
);

providersRouter.post(
  "/accounts/confirm",
  validate(confirmProviderAccountsSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new HttpError(401, "Authentication required");
    }

    const confirmedAccounts = [];
    for (const account of req.body.accounts as {
      providerAccountId: string;
      accountId?: string;
    }[]) {
      confirmedAccounts.push(
        await createOrLinkProviderAccount({
          userId,
          providerAccountId: account.providerAccountId,
          accountId: account.accountId
        })
      );
    }

    res.status(201).json({
      accounts: serialize(confirmedAccounts.map(providerAccountSummary))
    });
  })
);
