import {
  getCryptoCurrencies,
  getCryptoUsdtPrice,
  isCryptoCurrencyCode
} from "../providers/binance/services/read.service.js";
import {
  getFiatCurrencies,
  getFiatExchangeRate,
  isFiatCurrencyCode
} from "../providers/frankfurter/services/read.service.js";
import { HttpError } from "../../../utils/httpError.js";

export async function listCurrencies() {
  const [fiatUnsorted, cryptoUnsorted] = await Promise.all([
    getFiatCurrencies(),
    getCryptoCurrencies()
  ]);
  const fiat = [...fiatUnsorted].sort((a, b) => a.code.localeCompare(b.code));
  const crypto = [...cryptoUnsorted].sort((a, b) =>
    a.code.localeCompare(b.code)
  );

  return {
    currencies: [...fiat, ...crypto].sort((a, b) =>
      a.code.localeCompare(b.code)
    ),
    fiat,
    crypto
  };
}

async function isFiat(code: string): Promise<boolean> {
  if (code === "USD") return true;
  if (await isCryptoCurrencyCode(code)) return false;
  return isFiatCurrencyCode(code);
}

// USD value of 1 unit of `code`, bridging crypto through Binance's USDT quote.
async function usdValueOf(code: string, codeIsFiat: boolean): Promise<number> {
  if (codeIsFiat) {
    return code === "USD" ? 1 : getFiatExchangeRate(code, "USD");
  }

  const price = await getCryptoUsdtPrice(code);
  if (price === null) {
    throw new HttpError(502, `Exchange rate is unavailable for ${code}`);
  }
  return price;
}

/**
 * Live rate such that `1 unit of from == rate units of to`. Fiat/fiat pairs
 * come straight from Frankfurter; any pair involving a crypto asset bridges
 * through Binance's USDT quote, per the Milestone 7 provider split.
 */
export async function getExchangeRate(from: string, to: string): Promise<number> {
  const fromCode = from.trim().toUpperCase();
  const toCode = to.trim().toUpperCase();
  if (fromCode === toCode) return 1;

  const [fromIsFiat, toIsFiat] = await Promise.all([
    isFiat(fromCode),
    isFiat(toCode)
  ]);

  if (fromIsFiat && toIsFiat) {
    return getFiatExchangeRate(fromCode, toCode);
  }

  const [usdPerFrom, usdPerTo] = await Promise.all([
    usdValueOf(fromCode, fromIsFiat),
    usdValueOf(toCode, toIsFiat)
  ]);

  return usdPerFrom / usdPerTo;
}
