import { useMutation } from "@tanstack/react-query";
import type { MobileSidebarSide } from "@flowledger/shared";
import { SelectField } from "../../../components/FormField";
import { useTheme } from "../../../hooks/useTheme";
import type { ThemePreference } from "../../../hooks/useTheme";
import * as usersClient from "../../../services/users.client";
import { useProfileUser } from "../hooks/useProfileUser";

/** Appearance (theme) and mobile sidebar drawer side preferences. */
export function PreferencesTab() {
  const { preference, setPreference } = useTheme();
  const { query, user, syncUser } = useProfileUser();
  const mutation = useMutation({
    mutationFn: (next: MobileSidebarSide) => usersClient.updateSidebarSide(next),
    onSuccess: (response) => syncUser(response.user)
  });
  const side = user?.mobileSidebarSide ?? "left";
  const disabled = (query.isLoading && !user) || mutation.isPending;

  return (
    <div className="grid gap-6 lg:max-w-xl">
      <section>
        <h3 className="text-lg font-semibold">Appearance</h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Choose how FlowLedger matches your device.
        </p>
        <div className="mt-4">
          <SelectField
            label="Theme"
            value={preference}
            onChange={(event) => setPreference(event.target.value as ThemePreference)}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </SelectField>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold">Mobile menu</h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Choose where the mobile sidebar drawer opens.
        </p>
        <label className="mt-4 flex items-center justify-between gap-4 rounded-md border border-slate-200 p-4 dark:border-slate-700">
          <span>
            <span className="block text-sm font-semibold text-ink dark:text-slate-100">
              Sidebar drawer side
            </span>
            <span className="mt-1 block text-sm text-slate-500 dark:text-slate-400">
              {side === "left" ? "Left sidebar drawer" : "Right sidebar drawer"}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>Left</span>
            <input
              type="checkbox"
              role="switch"
              className="peer sr-only"
              checked={side === "right"}
              aria-label="Use right sidebar drawer"
              disabled={disabled}
              onChange={(event) => mutation.mutate(event.target.checked ? "right" : "left")}
            />
            <span
              aria-hidden="true"
              className="relative h-7 w-12 rounded-full bg-slate-300 transition peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-pine peer-focus:ring-offset-2 peer-checked:bg-pine dark:bg-slate-700 dark:peer-checked:bg-emerald-500 dark:peer-focus:ring-offset-slate-950"
            >
              <span
                className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition ${
                  side === "right" ? "translate-x-5" : ""
                }`}
              />
            </span>
            <span>Right</span>
          </span>
        </label>
      </section>
    </div>
  );
}
