import {
  accountFiltersSchema,
  accountSchema,
  updateAccountSchema
} from "@flowledger/shared";
import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { notFound } from "../../utils/httpError.js";
import { serialize } from "../../utils/serialize.js";
import { getExchangeRate, roundMoney } from "../currencies/exchangeRate.service.js";
import { withAccountBalances } from "../transactions/transactionCalculations.js";

export const accountsRouter = Router();

type ProviderAccountWithConnection = {
  id: string;
  provider: string;
  providerCredentialId: string;
  providerAccountId: string;
  accountMetadata: unknown;
  status: string;
  failureReason: string | null;
  requiresManualReconnect: boolean;
  lastSyncAt: Date | null;
  lastSyncSuccessAt: Date | null;
  lastSyncFailureAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  connection: {
    id: string;
    institutionId: string | null;
    institutionName: string | null;
    status: string;
    failureReason: string | null;
    requiresManualReconnect: boolean;
    lastSyncAt: Date | null;
    lastSyncSuccessAt: Date | null;
    lastSyncFailureAt: Date | null;
  } | null;
};

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function getNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function providerAccountSyncSummary(
  providerAccount: ProviderAccountWithConnection
) {
  const metadata = getRecord(providerAccount.accountMetadata);

  return {
    id: providerAccount.id,
    provider: providerAccount.provider,
    providerCredentialId: providerAccount.providerCredentialId,
    providerAccountId: providerAccount.providerAccountId,
    institutionId: providerAccount.connection?.institutionId ?? null,
    institutionName: providerAccount.connection?.institutionName ?? null,
    accountName: getString(metadata.name),
    accountType: getString(metadata.type),
    currency: getString(metadata.currency),
    externalBalance: getNumber(metadata.balance),
    status: providerAccount.status,
    failureReason:
      providerAccount.failureReason ??
      providerAccount.connection?.failureReason ??
      null,
    requiresManualReconnect:
      providerAccount.requiresManualReconnect ||
      providerAccount.connection?.requiresManualReconnect ||
      false,
    connectionStatus: providerAccount.connection?.status ?? null,
    lastSyncAt:
      providerAccount.lastSyncAt ??
      providerAccount.connection?.lastSyncAt ??
      null,
    lastSyncSuccessAt:
      providerAccount.lastSyncSuccessAt ??
      providerAccount.connection?.lastSyncSuccessAt ??
      null,
    lastSyncFailureAt:
      providerAccount.lastSyncFailureAt ??
      providerAccount.connection?.lastSyncFailureAt ??
      null,
    createdAt: providerAccount.createdAt,
    updatedAt: providerAccount.updatedAt
  };
}

async function withPreferredCurrencyBalances<
  TAccount extends { currency: string; currentBalance: number }
>(accounts: TAccount[], preferredCurrency: string | null) {
  return Promise.all(
    accounts.map(async (account) => {
      if (!preferredCurrency || account.currency === preferredCurrency) {
        return {
          ...account,
          currentBalanceInPreferredCurrency: account.currentBalance
        };
      }

      const rate = await getExchangeRate(account.currency, preferredCurrency);
      return {
        ...account,
        currentBalanceInPreferredCurrency: roundMoney(
          account.currentBalance * rate
        )
      };
    })
  );
}

export function accountListItemWithSyncSummary<
  TAccount extends { providerAccounts: ProviderAccountWithConnection[] }
>(account: TAccount) {
  const sync = account.providerAccounts.map(providerAccountSyncSummary);
  const { providerAccounts: _providerAccounts, ...safeAccount } = account;

  return {
    ...safeAccount,
    source: sync.length > 0 ? "synced" : "manual",
    sync
  };
}

accountsRouter.get(
  "/",
  validate(accountFiltersSchema, "query"),
  asyncHandler(async (req, res) => {
    const filters = req.query as { includeArchived?: string };
    const [user, accounts, transactions] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: req.user!.id },
        select: { preferredCurrency: true }
      }),
      prisma.account.findMany({
        where: {
          userId: req.user!.id,
          ...(filters.includeArchived === "true" ? {} : { isArchived: false })
        },
        include: {
          providerAccounts: {
            include: {
              connection: {
                select: {
                  id: true,
                  institutionId: true,
                  institutionName: true,
                  status: true,
                  failureReason: true,
                  requiresManualReconnect: true,
                  lastSyncAt: true,
                  lastSyncSuccessAt: true,
                  lastSyncFailureAt: true
                }
              }
            },
            orderBy: { updatedAt: "desc" }
          }
        },
        orderBy: { createdAt: "desc" }
      }),
      prisma.transaction.findMany({
        where: { userId: req.user!.id },
        select: {
          accountId: true,
          transferToAccountId: true,
          type: true,
          amount: true
        }
      })
    ]);

    const accountsWithBalances = await withPreferredCurrencyBalances(
      withAccountBalances(accounts, transactions),
      user.preferredCurrency
    );

    res.json({
      accounts: serialize(
        accountsWithBalances.map(accountListItemWithSyncSummary)
      )
    });
  })
);

accountsRouter.post(
  "/",
  validate(accountSchema),
  asyncHandler(async (req, res) => {
    const account = await prisma.account.create({
      data: { ...req.body, userId: req.user!.id }
    });
    res.status(201).json({ account: serialize(account) });
  })
);

accountsRouter.put(
  "/:id",
  validate(updateAccountSchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.account.findFirst({
      where: { id: req.params.id, userId: req.user!.id }
    });
    if (!existing) throw notFound("Account");

    const account = await prisma.account.update({
      where: { id: existing.id },
      data: req.body
    });
    res.json({ account: serialize(account) });
  })
);

accountsRouter.post(
  "/:id/archive",
  asyncHandler(async (req, res) => {
    const existing = await prisma.account.findFirst({
      where: { id: req.params.id, userId: req.user!.id }
    });
    if (!existing) throw notFound("Account");

    const account = await prisma.account.update({
      where: { id: existing.id },
      data: { isArchived: true, archivedAt: new Date() }
    });
    res.json({ account: serialize(account) });
  })
);

accountsRouter.post(
  "/:id/restore",
  asyncHandler(async (req, res) => {
    const existing = await prisma.account.findFirst({
      where: { id: req.params.id, userId: req.user!.id }
    });
    if (!existing) throw notFound("Account");

    const account = await prisma.account.update({
      where: { id: existing.id },
      data: { isArchived: false, archivedAt: null }
    });
    res.json({ account: serialize(account) });
  })
);

accountsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.account.findFirst({
      where: { id: req.params.id, userId: req.user!.id }
    });
    if (!existing) throw notFound("Account");

    await prisma.account.delete({ where: { id: existing.id } });
    res.status(204).send();
  })
);
