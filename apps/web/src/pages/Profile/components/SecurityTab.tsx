import { ApiKeysSection } from "./ApiKeysSection";
import { ConnectClientSection } from "./ConnectClientSection";
import { ConnectedAppsSection } from "./ConnectedAppsSection";
import { GoogleSection } from "./GoogleSection";
import { PasswordSection } from "./PasswordSection";

/** Security & API tab: password, Google sign-in, personal API keys, connected OAuth apps and AI-client setup, as separate card sections. */
export function SecurityTab() {
  return (
    <div className="grid gap-4 lg:max-w-3xl">
      <PasswordSection />
      <GoogleSection />
      <ApiKeysSection />
      <ConnectedAppsSection />
      <ConnectClientSection />
    </div>
  );
}
