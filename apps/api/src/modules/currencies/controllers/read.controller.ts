import type { CurrencyRateQuery } from "@flowledger/shared";
import type { Request, Response } from "express";
import { getExchangeRate, listCurrencies } from "../services/read.service.js";

/** Lists all supported fiat and crypto currencies. */
export async function getCurrencies(_req: Request, res: Response) {
  const { currencies, fiat, crypto } = await listCurrencies();
  res.json({ currencies, fiat, crypto });
}

/** Returns the live exchange rate between two currencies. */
export async function getRate(req: Request, res: Response) {
  const { from, to } = req.query as unknown as CurrencyRateQuery;
  const rate = await getExchangeRate(from, to);
  res.json({ from, to, rate });
}
