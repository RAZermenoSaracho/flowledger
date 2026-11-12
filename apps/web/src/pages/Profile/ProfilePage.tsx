import { Card } from "../../components/Card";
import { FormView } from "../../components/FormView";
import { BlockedUsersTab } from "./components/BlockedUsersTab";
import { GeneralTab } from "./components/GeneralTab";
import { IdentityFields } from "./components/IdentityFields";
import { PreferencesTab } from "./components/PreferencesTab";
import { ProfileHeader } from "./components/ProfileHeader";
import { SecurityTab } from "./components/SecurityTab";
import { SubscriptionTab } from "./components/SubscriptionTab";
import { PROFILE_TABS } from "./constants";
import { useProfileDetails } from "./hooks/useProfileDetails";

/** Profile form view: identity header plus in-page tabs; the active tab lives in the `?tab=` search param and only that panel is mounted. */
export function ProfilePage() {
  const profile = useProfileDetails();
  const content = {
    general: (
      <GeneralTab profile={profile}>
        <IdentityFields profile={profile} />
      </GeneralTab>
    ),
    preferences: <PreferencesTab />,
    security: <SecurityTab />,
    blocked: <BlockedUsersTab />,
    subscription: <SubscriptionTab />
  };

  return (
    <Card>
      <FormView
        title="Profile"
        draft={profile.draft}
        onSave={profile.onSave}
        headerExtra={<ProfileHeader profile={profile} />}
        tabs={PROFILE_TABS.map((tab) => ({ ...tab, content: content[tab.id] }))}
      />
    </Card>
  );
}
