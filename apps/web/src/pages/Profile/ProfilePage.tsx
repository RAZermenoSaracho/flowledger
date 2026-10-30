import { useSearchParams } from "react-router-dom";
import { Card } from "../../components/Card";
import { GeneralTab } from "./components/GeneralTab";
import { PreferencesTab } from "./components/PreferencesTab";
import { ProfileHeader } from "./components/ProfileHeader";
import { ProfileTabs } from "./components/ProfileTabs";
import { SecurityTab } from "./components/SecurityTab";
import { SubscriptionTab } from "./components/SubscriptionTab";
import { PROFILE_TABS } from "./constants";
import { useProfileDetails } from "./hooks/useProfileDetails";
import type { ProfileTabId } from "./types/profile.types";

const panels: Record<Exclude<ProfileTabId, "general">, () => JSX.Element> = {
  preferences: PreferencesTab,
  security: SecurityTab,
  subscription: SubscriptionTab
};

/** Profile form view: identity header plus in-page tabs; the active tab lives in the `?tab=` search param and only that panel is mounted. */
export function ProfilePage() {
  const profile = useProfileDetails();
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const active = PROFILE_TABS.find((t) => t.id === requested)?.id ?? "general";
  const Panel = active === "general" ? null : panels[active];

  return (
    <Card className="grid grid-cols-1 gap-6">
      <ProfileHeader profile={profile} />
      <div>
        <ProfileTabs
          active={active}
          onChange={(id) => setParams({ tab: id }, { replace: true })}
        />
        <div
          role="tabpanel"
          id={`profile-panel-${active}`}
          aria-labelledby={`profile-tab-${active}`}
          tabIndex={0}
          className="pt-6 focus-visible:outline-none"
        >
          {active === "general" ? (
            <GeneralTab profile={profile} />
          ) : Panel ? (
            <Panel />
          ) : null}
        </div>
      </div>
    </Card>
  );
}
