import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../hooks/useAuth";
import { ThemeProvider } from "../../hooks/useTheme";

type RenderWithProvidersOptions = {
  /** Initial `MemoryRouter` entry. Defaults to `"/"`. */
  route?: string;
  /** Wrap in `AuthProvider` — only needed when the tree under test calls `useAuth()`. */
  withAuth?: boolean;
  /** Wrap in `ThemeProvider` — only needed when the tree under test calls `useTheme()`. */
  withTheme?: boolean;
  /** A pre-configured `QueryClient`, e.g. to pre-seed the cache. Defaults to a fresh client with retries disabled. */
  queryClient?: QueryClient;
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
}

/**
 * Renders `ui` wrapped in the provider stack most component/hook tests need:
 * a `QueryClient` and `MemoryRouter` always, `AuthProvider`/`ThemeProvider`
 * opt-in. Query retries are disabled so a mocked-failure test doesn't hang
 * waiting for TanStack Query's default retry/backoff.
 */
export function renderWithProviders(
  ui: ReactElement,
  {
    route = "/",
    withAuth = false,
    withTheme = false,
    queryClient = createTestQueryClient()
  }: RenderWithProvidersOptions = {}
) {
  function Wrapper({ children }: { children: ReactNode }) {
    let tree = <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>;
    if (withAuth) tree = <AuthProvider>{tree}</AuthProvider>;
    if (withTheme) tree = <ThemeProvider>{tree}</ThemeProvider>;
    return <QueryClientProvider client={queryClient}>{tree}</QueryClientProvider>;
  }

  return { queryClient, ...render(ui, { wrapper: Wrapper }) };
}
