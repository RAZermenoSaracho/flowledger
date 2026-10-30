import { ApiKeysSection } from "./components/ApiKeysSection";
import { ConnectClientSection } from "./components/ConnectClientSection";

/** Developer settings page: personal API keys and instructions for connecting AI clients. */
export function DeveloperPage() {
  return (
    <div className="grid gap-6">
      <ApiKeysSection />
      <ConnectClientSection />
    </div>
  );
}
