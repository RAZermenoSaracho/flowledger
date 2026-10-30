import { ApiKeysSection } from "./components/ApiKeysSection";
import { ConnectClientSection } from "./components/ConnectClientSection";
import { ConnectedAppsSection } from "./components/ConnectedAppsSection";

/** Developer settings page: personal API keys, connected OAuth apps and instructions for connecting AI clients. */
export function DeveloperPage() {
  return (
    <div className="grid gap-6">
      <ApiKeysSection />
      <ConnectedAppsSection />
      <ConnectClientSection />
    </div>
  );
}
