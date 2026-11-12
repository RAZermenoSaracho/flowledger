import { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { HttpError } from "../../../utils/httpError.js";
import { assertProviderAvailable } from "../utils/providerAvailability.js";
import { getProvider } from "../utils/providerRegistry.js";
import {
  findSelectedConnector,
  findSelectedInstitution,
  listAvailableConnectors,
  listAvailableInstitutions
} from "../utils/institutionCatalog.js";
import {
  getRecord,
  getString,
  normalizeAccountType,
  providerAccountSummary
} from "../utils/providerAccountMetadata.js";

/** Starts a provider connection flow for the requested institution (or bare connector, when no institution catalog entry is selected), throwing 503 if the provider is switched off, or 404/501 if not offered or unconfigured. */
export async function createConnection(
  userId: string,
  body: { institutionId?: string; provider?: string }
) {
  const { institutionId, provider: providerKey } = body;
  if (providerKey) assertProviderAvailable(getProvider(providerKey));
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

  return {
    provider: flow.provider,
    connectorId: connector?.connectorId,
    institutionId: institution?.institutionId,
    institutionName: institution?.name ?? connector!.title,
    flowId: "flowId" in flow ? flow.flowId : undefined,
    token: flow.token,
    url: "url" in flow ? flow.url : undefined,
    widget: "widget" in flow ? flow.widget : undefined
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
      initialBalance: parseBalance(metadata.balance)
    }
  });

  return prisma.providerAccount.update({
    where: { id: providerAccount.id },
    data: { accountId: account.id },
    include: { account: true, connection: true }
  });
}

/** Exact `Decimal` from a provider-reported balance (string or number as received); anything non-numeric becomes 0. */
function parseBalance(raw: unknown): Prisma.Decimal {
  if (typeof raw !== "string" && typeof raw !== "number") return new Prisma.Decimal(0);
  try {
    const value = new Prisma.Decimal(raw);
    return value.isFinite() ? value : new Prisma.Decimal(0);
  } catch {
    return new Prisma.Decimal(0);
  }
}

/** Links each selected provider account to an existing FlowLedger account, or creates one from provider metadata if none is specified. */
export async function confirmProviderAccounts(
  userId: string,
  accounts: { providerAccountId: string; accountId?: string }[]
) {
  const confirmedAccounts = [];
  for (const account of accounts) {
    confirmedAccounts.push(
      await createOrLinkProviderAccount({
        userId,
        providerAccountId: account.providerAccountId,
        accountId: account.accountId
      })
    );
  }

  return confirmedAccounts.map(providerAccountSummary);
}
