import { useQuery } from "@tanstack/react-query";
import { SelectField } from "./FormField";
import { listCurrencies } from "../services/currencies.client";

export function useCurrenciesQuery() {
  return useQuery({
    queryKey: ["currencies"],
    queryFn: () => listCurrencies(),
    staleTime: 60 * 60 * 1000
  });
}

export function CurrencySelect({
  label,
  value,
  onChange,
  disabled,
  allowNoPreference
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  allowNoPreference?: boolean;
}) {
  const currenciesQuery = useCurrenciesQuery();
  const fiatCurrencies = currenciesQuery.data?.fiat ?? [];
  const cryptoCurrencies = currenciesQuery.data?.crypto ?? [];

  return (
    <SelectField
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled || currenciesQuery.isLoading || currenciesQuery.isError}
    >
      {currenciesQuery.isLoading ? (
        <option value="">Loading currencies...</option>
      ) : currenciesQuery.isError ? (
        <option value="">Could not load currencies</option>
      ) : (
        <>
          {allowNoPreference ? <option value="">No preference</option> : null}
          {fiatCurrencies.length > 0 ? (
            <optgroup label="Fiat currencies">
              {fiatCurrencies.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.code} — {currency.name}
                </option>
              ))}
            </optgroup>
          ) : null}
          {cryptoCurrencies.length > 0 ? (
            <optgroup label="Crypto assets">
              {cryptoCurrencies.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.code}
                </option>
              ))}
            </optgroup>
          ) : null}
        </>
      )}
    </SelectField>
  );
}
