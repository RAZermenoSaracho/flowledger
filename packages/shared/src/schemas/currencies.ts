import { z } from "zod";
import { currencyCodeSchema } from "./common.js";

export const currencyRateQuerySchema = z.object({
  from: currencyCodeSchema,
  to: currencyCodeSchema
});

export type CurrencyRateQuery = z.infer<typeof currencyRateQuerySchema>;
