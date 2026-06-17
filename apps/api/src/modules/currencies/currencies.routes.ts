import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getCryptoCurrencies } from "../providers/binance/binance.service.js";
import { getFiatCurrencies } from "../providers/frankfurter/frankfurter.service.js";

export const currenciesRouter = Router();

currenciesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const [fiat, crypto] = await Promise.all([getFiatCurrencies(), getCryptoCurrencies()]);
    const currencies = [...fiat, ...crypto].sort((a, b) => a.code.localeCompare(b.code));
    res.json({ currencies });
  })
);
