## Context

`planType` is a plain `String` column with default `"free"`. It is displayed (profile header, General tab, Subscription tab) but gates nothing. There is no billing provider, webhook, admin role, or operator tooling in the repo.

## Decisions

1. **Delete the endpoint instead of gating it.** A role or billing check needs a concept that does not exist (admin flag, payment provider). Removing the only write path makes the field server-controlled now, and the smallest correct fix per CLAUDE.md ("no speculative abstractions"). A 404 (route no longer exists) satisfies the "rejected, plan unchanged" criterion for all users.
2. **No trusted path yet.** The task's "trusted path can change the plan" is satisfied minimally by operator DB update; the first plan-gated feature or billing integration task owns building the real path (billing webhook or owner action). That feature adds the write endpoint with its own authorization.
3. **Read-only Subscription tab.** Keep the tab (current plan label and description from `planLabels`/`planDescriptions`), drop the action buttons, `usePlan`, and the client call. The plan comes from `useProfileUser`, as the General tab already does.
4. **Mass-assignment stays closed.** `updateUserPreferencesSchema` keeps stripping `planType` (existing tests retained).

## Owner decisions

1. Confirm "delete now; billing builds the trusted path later" (no owner-only path now).
2. Remove the Subscription tab entirely (GeneralTab and ProfileHeader already show the plan) or keep it read-only. Recommended: remove it. If removed, tasks 3.2 deletes `SubscriptionTab.tsx`, its test, and its `ProfilePage` entry instead of making it read-only.

## Risks

- Removing the endpoint breaks any external client calling it; none known (`/v1` and MCP never exposed it).
- A cached older web bundle shows Upgrade buttons that now fail with 404 until reload; the existing error handling is gone with `usePlan`, so deploy API and web together.
