import { useSearchParams } from "react-router-dom";
import { Card } from "../../components/Card";
import { GeneralTab } from "./components/GeneralTab";
import { PreferencesTab } from "./components/PreferencesTab";
import { ProfileHeader } from "./components/ProfileHeader";
import { ProfileTabs } from "./components/ProfileTabs";
import { SecurityTab } from "./components/SecurityTab";
import { SubscriptionTab } from "./components/SubscriptionTab";
import { PROFILE_TABS } from "./constants";
import type { ProfileTabId } from "./types/profile.types";

const panels: Record<ProfileTabId, () => JSX.Element> = {
  general: GeneralTab,
  preferences: PreferencesTab,
  security: SecurityTab,
  subscription: SubscriptionTab
};

/** Profile form view: identity header plus in-page tabs; the active tab lives in the `?tab=` search param and only that panel is mounted. */
export function ProfilePage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const active = PROFILE_TABS.find((t) => t.id === requested)?.id ?? "general";
  const Panel = panels[active];

  return (
    <Card className="grid grid-cols-1 gap-6">
      <ProfileHeader />
      <div>
        <ProfileTabs active={active} onChange={(id) => setParams({ tab: id }, { replace: true })} />
        <div
          role="tabpanel"
          id={`profile-panel-${active}`}
          aria-labelledby={`profile-tab-${active}`}
          tabIndex={0}
          className="pt-6 focus-visible:outline-none"
        >
          <Panel />
        </div>
      </div>
    </Card>
  );
}
