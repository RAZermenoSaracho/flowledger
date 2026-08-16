import { useQuery } from "@tanstack/react-query";
import {
  KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from "react";
import { listCurrencies } from "../services/currencies.client";

/** React Query hook fetching the supported fiat/crypto currency list. */
export function useCurrenciesQuery() {
  return useQuery({
    queryKey: ["currencies"],
    queryFn: () => listCurrencies(),
    staleTime: 60 * 60 * 1000
  });
}

type CurrencyOption = {
  code: string;
  label: string;
  group: "none" | "fiat" | "crypto";
};

const MAX_VISIBLE_OPTIONS = 50;

/** Searchable dropdown for choosing a fiat or crypto currency, grouped by type — type to filter by code or name instead of scrolling. */
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
  const isLoading = currenciesQuery.isLoading;
  const isError = currenciesQuery.isError;
  const isDisabled = Boolean(disabled) || isLoading || isError;

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  function labelForCode(code: string) {
    if (!code) return "";
    const fiat = fiatCurrencies.find((currency) => currency.code === code);
    if (fiat) return `${fiat.code} — ${fiat.name}`;
    const crypto = cryptoCurrencies.find((currency) => currency.code === code);
    if (crypto) return crypto.code;
    return code;
  }

  const trimmedQuery = query.trim().toLowerCase();
  const currencyData = currenciesQuery.data;

  const { options, totalMatchCount } = useMemo(() => {
    const matches: CurrencyOption[] = [];
    if (
      allowNoPreference &&
      (!trimmedQuery || "no preference".includes(trimmedQuery))
    ) {
      matches.push({ code: "", label: "No preference", group: "none" });
    }
    for (const currency of currencyData?.fiat ?? []) {
      if (
        !trimmedQuery ||
        currency.code.toLowerCase().includes(trimmedQuery) ||
        currency.name.toLowerCase().includes(trimmedQuery)
      ) {
        matches.push({
          code: currency.code,
          label: `${currency.code} — ${currency.name}`,
          group: "fiat"
        });
      }
    }
    for (const currency of currencyData?.crypto ?? []) {
      if (!trimmedQuery || currency.code.toLowerCase().includes(trimmedQuery)) {
        matches.push({ code: currency.code, label: currency.code, group: "crypto" });
      }
    }
    // Rendering every match (800+ crypto assets when the search is empty or
    // short) re-mounts hundreds of DOM nodes on every keystroke, which is
    // both sluggish and, in practice, never useful to scroll through — cap
    // what's rendered and prompt for a narrower search instead.
    return { options: matches.slice(0, MAX_VISIBLE_OPTIONS), totalMatchCount: matches.length };
  }, [allowNoPreference, currencyData, trimmedQuery]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setQuery("");
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        setQuery("");
        inputRef.current?.blur();
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  function selectOption(code: string) {
    onChange(code);
    setIsOpen(false);
    setQuery("");
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (!isOpen) {
      if (event.key === "ArrowDown" || event.key === "Enter") {
        event.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.min(current + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = options[highlightedIndex];
      if (option) selectOption(option.code);
    }
  }

  const inputValue = isLoading
    ? "Loading currencies..."
    : isError
      ? "Could not load currencies"
      : isOpen
        ? query
        : labelForCode(value);

  return (
    <div className="relative" ref={containerRef}>
      <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
        <span>{label}</span>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          autoComplete="off"
          className="min-h-10 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-pine focus:ring-2 focus:ring-mint disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-emerald-900"
          value={inputValue}
          disabled={isDisabled}
          placeholder="Search currency..."
          onFocus={() => {
            setIsOpen(true);
            setQuery("");
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
      </label>
      {isOpen && !isDisabled ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-800 dark:bg-slate-900"
        >
          {options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
              No matching currencies
            </li>
          ) : (
            options.map((option, index) => (
              <li key={option.code || "__no_preference__"}>
                {index === 0 || options[index - 1]!.group !== option.group ? (
                  <p
                    aria-hidden="true"
                    className="px-3 py-1 text-xs font-semibold uppercase text-slate-400 dark:text-slate-500"
                  >
                    {option.group === "fiat"
                      ? "Fiat currencies"
                      : option.group === "crypto"
                        ? "Crypto assets"
                        : ""}
                  </p>
                ) : null}
                <div
                  role="option"
                  aria-selected={option.code === value}
                  className={`cursor-pointer px-3 py-2 text-sm ${
                    index === highlightedIndex
                      ? "bg-mint dark:bg-emerald-950"
                      : ""
                  }`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectOption(option.code);
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  {option.label}
                </div>
              </li>
            ))
          )}
          {totalMatchCount > options.length ? (
            <li
              aria-hidden="true"
              className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500"
            >
              {totalMatchCount - options.length} more match
              {totalMatchCount - options.length === 1 ? "" : "es"} — keep typing to narrow it down
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
