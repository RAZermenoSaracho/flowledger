import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { CurrencySelect, useCurrenciesQuery } from "../../components/CurrencySelect";
import { SelectField, TextInput } from "../../components/FormField";
import type { MobileSidebarSide } from "@flowledger/shared";
import { useAuth } from "../../hooks/useAuth";
import { useTheme } from "../../hooks/useTheme";
import type { ThemePreference } from "../../hooks/useTheme";
import * as usersClient from "../../services/users.client";
import type { User } from "../../types/api";

const planLabels = {
  free: "Free",
  flowledger_one: "FlowLedger One"
} as const;

const planDescriptions = {
  free: "Free covers the core FlowLedger experience: accounts, transactions, budgeting, and reports.",
  flowledger_one:
    "FlowLedger One adds priority support, early access to new features, and premium reporting tools on top of everything in Free."
} as const;

export function ProfilePage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { preference, setPreference } = useTheme();
  const [name, setName] = useState(auth.user?.name ?? "");
  const [email, setEmail] = useState(auth.user?.email ?? "");
  const [preferredCurrency, setPreferredCurrency] = useState(auth.user?.preferredCurrency ?? "");
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  const profileQuery = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const response = await usersClient.getProfile();
      auth.setUser(response.user);
      return response.user;
    },
    initialData: auth.user ?? undefined
  });

  const currenciesQuery = useCurrenciesQuery();

  useEffect(() => {
    if (profileQuery.data && !isEditingProfile) {
      setName(profileQuery.data.name);
      setEmail(profileQuery.data.email);
      setPreferredCurrency(profileQuery.data.preferredCurrency ?? "");
    }
  }, [isEditingProfile, profileQuery.data]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [avatarFile]);

  function syncUser(user: User) {
    auth.setUser(user);
    queryClient.setQueryData(["me"], user);
  }

  const updateProfile = useMutation({
    mutationFn: () =>
      usersClient.updateProfile({
        name,
        email,
        preferredCurrency: preferredCurrency || null
      }),
    onSuccess: (response) => syncUser(response.user)
  });

  const uploadAvatar = useMutation({
    mutationFn: (file: File) => usersClient.uploadAvatar(file),
    onSuccess: (response) => syncUser(response.user)
  });

  const updatePassword = useMutation({
    mutationFn: () =>
      usersClient.updatePassword({
        currentPassword,
        newPassword,
        confirmPassword
      }),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Password updated");
    }
  });

  const updatePlan = useMutation({
    mutationFn: (planType: User["planType"]) => usersClient.updatePlan(planType),
    onSuccess: async (response) => {
      auth.setUser(response.user);
      queryClient.setQueryData(["me"], response.user);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    }
  });

  const updateSidebarSide = useMutation({
    mutationFn: (mobileSidebarSide: MobileSidebarSide) =>
      usersClient.updateSidebarSide(mobileSidebarSide),
    onSuccess: (response) => syncUser(response.user)
  });

  async function submitProfile(event: FormEvent) {
    event.preventDefault();
    setProfileError(null);
    setProfileMessage(null);

    try {
      await updateProfile.mutateAsync();
      if (avatarFile) {
        await uploadAvatar.mutateAsync(avatarFile);
      }
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      setAvatarFile(null);
      setIsEditingProfile(false);
      setProfileMessage("Profile updated");
    } catch (caught) {
      setProfileError(caught instanceof Error ? caught.message : "Profile could not be updated");
    }
  }

  function startEditingProfile() {
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
    setPreferredCurrency(user?.preferredCurrency ?? "");
    setAvatarFile(null);
    setProfileError(null);
    setProfileMessage(null);
    setIsEditingProfile(true);
  }

  function cancelEditingProfile() {
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
    setPreferredCurrency(user?.preferredCurrency ?? "");
    setAvatarFile(null);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setProfileError(null);
    setPasswordError(null);
    setIsEditingProfile(false);
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordMessage(null);

    try {
      await updatePassword.mutateAsync();
    } catch (caught) {
      setPasswordError(caught instanceof Error ? caught.message : "Password could not be updated");
    }
  }

  async function changePlan(planType: User["planType"]) {
    setPlanError(null);

    try {
      await updatePlan.mutateAsync(planType);
    } catch (caught) {
      setPlanError(caught instanceof Error ? caught.message : "Plan could not be updated");
    }
  }

  const user = profileQuery.data;
  const isLoading = profileQuery.isLoading && !user;
  const currentPlan = user?.planType ?? "free";
  const allCurrencies = currenciesQuery.data?.currencies ?? [];
  const currencyDetail = (() => {
    if (!user?.preferredCurrency) return "Not set";
    const c = allCurrencies.find((cur) => cur.code === user.preferredCurrency);
    if (!c) return user.preferredCurrency;
    return c.type === "fiat" ? `${c.code} — ${c.name}` : c.code;
  })();
  const profileAvatarUrl = avatarPreviewUrl ?? usersClient.getAvatarUrl(user?.avatarUrl);
  const isProfileSaving = updateProfile.isPending || uploadAvatar.isPending;
  const initials = (user?.name ?? "FL")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
      <section className="grid gap-6">
        <Card>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              {profileAvatarUrl ? (
                <img
                  src={profileAvatarUrl}
                  alt=""
                  className="h-16 w-16 rounded-full border border-slate-200 object-cover dark:border-slate-700"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-mint text-lg font-bold text-pine dark:bg-emerald-950 dark:text-emerald-200">
                  {initials}
                </div>
              )}
              <div>
                <h2 className="text-xl font-semibold">Profile and account</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Manage your FlowLedger identity, sign-in details, and MVP plan.
                </p>
              </div>
            </div>
            {!isEditingProfile ? (
              <Button type="button" className="w-full sm:w-auto" onClick={startEditingProfile} disabled={isLoading}>
                Edit Profile
              </Button>
            ) : null}
          </div>

          {profileQuery.isError ? (
            <p className="mt-4 text-sm text-red-600 dark:text-red-400">
              {profileQuery.error instanceof Error ? profileQuery.error.message : "Profile could not be loaded"}
            </p>
          ) : null}

          <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
            <Detail label="Name" value={user?.name ?? "Loading..."} />
            <Detail label="Email" value={user?.email ?? "Loading..."} />
            <Detail label="Plan" value={planLabels[currentPlan]} />
            <Detail label="Currency" value={currencyDetail} />
            <Detail label="Member since" value={user ? new Date(user.createdAt).toLocaleDateString() : "Loading..."} />
          </dl>
        </Card>

        {isEditingProfile ? (
          <Card>
            <h3 className="text-lg font-semibold">Profile details</h3>
            <form className="mt-4 grid gap-4" onSubmit={submitProfile}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                {profileAvatarUrl ? (
                  <img
                    src={profileAvatarUrl}
                    alt=""
                    className="h-20 w-20 rounded-full border border-slate-200 object-cover dark:border-slate-700"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-mint text-xl font-bold text-pine dark:bg-emerald-950 dark:text-emerald-200">
                    {initials}
                  </div>
                )}
                <label className="grid gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <span>Profile picture</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)}
                    disabled={isLoading || isProfileSaving}
                    className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-pine file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-ink dark:text-slate-300 dark:file:bg-emerald-700"
                  />
                  <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                    JPG, PNG, WebP, or GIF up to 2 MB.
                  </span>
                </label>
              </div>
              <TextInput
                label="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={120}
                disabled={isLoading || isProfileSaving}
              />
              <TextInput
                label="Email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                maxLength={255}
                disabled={isLoading || isProfileSaving}
              />
              <CurrencySelect
                label="Preferred currency"
                value={preferredCurrency}
                onChange={setPreferredCurrency}
                disabled={isLoading || isProfileSaving}
                allowNoPreference
              />
              {profileError ? <p className="text-sm text-red-600 dark:text-red-400">{profileError}</p> : null}
              {profileMessage ? <p className="text-sm text-pine dark:text-emerald-300">{profileMessage}</p> : null}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="submit" disabled={isLoading || isProfileSaving}>
                  Save profile
                </Button>
                <Button type="button" variant="secondary" onClick={cancelEditingProfile} disabled={isProfileSaving}>
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        ) : profileMessage ? (
          <p className="text-sm text-pine dark:text-emerald-300">{profileMessage}</p>
        ) : null}

        {isEditingProfile ? (
          <Card>
            <h3 className="text-lg font-semibold">Password</h3>
            <form className="mt-4 grid gap-4" onSubmit={submitPassword}>
              <TextInput
                label="Current password"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                maxLength={128}
              />
              <TextInput
                label="New password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                minLength={8}
                maxLength={128}
              />
              <TextInput
                label="Confirm new password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={8}
                maxLength={128}
              />
              {passwordError ? <p className="text-sm text-red-600 dark:text-red-400">{passwordError}</p> : null}
              {passwordMessage ? <p className="text-sm text-pine dark:text-emerald-300">{passwordMessage}</p> : null}
              <Button type="submit" disabled={updatePassword.isPending}>
                Change password
              </Button>
            </form>
          </Card>
        ) : null}
      </section>

      <Card className="self-start">
        <div className="grid gap-6">
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
                  {(user?.mobileSidebarSide ?? "left") === "left" ? "Left sidebar drawer" : "Right sidebar drawer"}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <span>Left</span>
                <input
                  type="checkbox"
                  role="switch"
                  className="peer sr-only"
                  checked={(user?.mobileSidebarSide ?? "left") === "right"}
                  aria-label="Use right sidebar drawer"
                  disabled={isLoading || updateSidebarSide.isPending}
                  onChange={(event) =>
                    updateSidebarSide.mutate(event.target.checked ? "right" : "left")
                  }
                />
                <span
                  aria-hidden="true"
                  className="relative h-7 w-12 rounded-full bg-slate-300 transition peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-pine peer-focus:ring-offset-2 peer-checked:bg-pine dark:bg-slate-700 dark:peer-checked:bg-emerald-500 dark:peer-focus:ring-offset-slate-950"
                >
                  <span
                    className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition ${
                      (user?.mobileSidebarSide ?? "left") === "right" ? "translate-x-5" : ""
                    }`}
                  />
                </span>
                <span>Right</span>
              </span>
            </label>
          </section>

          <section>
            <h3 className="text-lg font-semibold">
              Account plan: {planLabels[currentPlan]}
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {planDescriptions[currentPlan]}
            </p>
            <div className="mt-4 grid gap-4">
              {currentPlan === "free" ? (
                <PlanOption
                  title="FlowLedger One"
                  description={planDescriptions.flowledger_one}
                  actionLabel="Upgrade"
                  onClick={() => changePlan("flowledger_one")}
                  disabled={updatePlan.isPending}
                />
              ) : (
                <PlanOption
                  title="Free"
                  description={planDescriptions.free}
                  actionLabel="Downgrade"
                  onClick={() => changePlan("free")}
                  disabled={updatePlan.isPending}
                />
              )}
              {planError ? <p className="text-sm text-red-600 dark:text-red-400">{planError}</p> : null}
            </div>
          </section>
        </div>
      </Card>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-1 break-words text-ink dark:text-slate-100">{value}</dd>
    </div>
  );
}

function PlanOption({
  title,
  description,
  actionLabel,
  onClick,
  disabled
}: {
  title: string;
  description: string;
  actionLabel: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <div className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
      <h4 className="font-semibold">{title}</h4>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
      <Button type="button" className="mt-4 w-full" onClick={onClick} disabled={disabled}>
        {actionLabel}
      </Button>
    </div>
  );
}
