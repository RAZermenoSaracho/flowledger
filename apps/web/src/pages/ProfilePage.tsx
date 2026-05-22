import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { SelectField, TextInput } from "../components/FormField";
import { useAuth } from "../hooks/useAuth";
import { apiRequest } from "../services/api";
import type { User } from "../types/api";

const planLabels = {
  free: "Free",
  flowledger_one: "FlowLedger One"
} as const;

export function ProfilePage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState(auth.user?.name ?? "");
  const [email, setEmail] = useState(auth.user?.email ?? "");
  const [avatarUrl, setAvatarUrl] = useState(auth.user?.avatarUrl ?? "");
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
      const response = await apiRequest<{ user: User }>("/users/me");
      auth.setUser(response.user);
      return response.user;
    },
    initialData: auth.user ?? undefined
  });

  useEffect(() => {
    if (profileQuery.data) {
      setName(profileQuery.data.name);
      setEmail(profileQuery.data.email);
      setAvatarUrl(profileQuery.data.avatarUrl ?? "");
    }
  }, [profileQuery.data]);

  const updateProfile = useMutation({
    mutationFn: () =>
      apiRequest<{ user: User }>("/users/me", {
        method: "PATCH",
        body: { name, email, avatarUrl }
      }),
    onSuccess: async (response) => {
      auth.setUser(response.user);
      queryClient.setQueryData(["me"], response.user);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      setProfileMessage("Profile updated");
    }
  });

  const updatePassword = useMutation({
    mutationFn: () =>
      apiRequest<void>("/users/me/password", {
        method: "PATCH",
        body: { currentPassword, newPassword, confirmPassword }
      }),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Password updated");
    }
  });

  const updatePlan = useMutation({
    mutationFn: (planType: User["planType"]) =>
      apiRequest<{ user: User }>("/users/me/plan", {
        method: "PATCH",
        body: { planType }
      }),
    onSuccess: async (response) => {
      auth.setUser(response.user);
      queryClient.setQueryData(["me"], response.user);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    }
  });

  async function submitProfile(event: FormEvent) {
    event.preventDefault();
    setProfileError(null);
    setProfileMessage(null);

    try {
      await updateProfile.mutateAsync();
    } catch (caught) {
      setProfileError(caught instanceof Error ? caught.message : "Profile could not be updated");
    }
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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
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

          {profileQuery.isError ? (
            <p className="mt-4 text-sm text-red-600 dark:text-red-400">
              {profileQuery.error instanceof Error ? profileQuery.error.message : "Profile could not be loaded"}
            </p>
          ) : null}

          <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
            <Detail label="Name" value={user?.name ?? "Loading..."} />
            <Detail label="Email" value={user?.email ?? "Loading..."} />
            <Detail label="Plan" value={planLabels[currentPlan]} />
            <Detail label="Member since" value={user ? new Date(user.createdAt).toLocaleDateString() : "Loading..."} />
          </dl>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold">Profile details</h3>
          <form className="mt-4 grid gap-4" onSubmit={submitProfile}>
            <TextInput
              label="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={120}
              disabled={isLoading}
            />
            <TextInput
              label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              maxLength={255}
              disabled={isLoading}
            />
            <TextInput
              label="Profile picture URL"
              type="url"
              value={avatarUrl}
              onChange={(event) => setAvatarUrl(event.target.value)}
              maxLength={2048}
              placeholder="https://example.com/avatar.jpg"
              disabled={isLoading}
            />
            {profileError ? <p className="text-sm text-red-600 dark:text-red-400">{profileError}</p> : null}
            {profileMessage ? <p className="text-sm text-pine dark:text-emerald-300">{profileMessage}</p> : null}
            <Button type="submit" disabled={isLoading || updateProfile.isPending}>
              Save profile
            </Button>
          </form>
        </Card>

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
      </section>

      <Card className="self-start">
        <h3 className="text-lg font-semibold">Account plan</h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Payments are not connected yet. This MVP control only changes the saved plan label.
        </p>
        <div className="mt-4 grid gap-4">
          <SelectField
            label="Plan type"
            value={currentPlan}
            onChange={(event) => changePlan(event.target.value as User["planType"])}
            disabled={isLoading || updatePlan.isPending}
          >
            <option value="free">Free</option>
            <option value="flowledger_one">FlowLedger One</option>
          </SelectField>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <PlanOption
              title="Free"
              description="Standard FlowLedger features."
              active={currentPlan === "free"}
              actionLabel="Downgrade"
              onClick={() => changePlan("free")}
              disabled={currentPlan === "free" || updatePlan.isPending}
            />
            <PlanOption
              title="FlowLedger One"
              description="Paid/VIP-style plan placeholder."
              active={currentPlan === "flowledger_one"}
              actionLabel="Upgrade"
              onClick={() => changePlan("flowledger_one")}
              disabled={currentPlan === "flowledger_one" || updatePlan.isPending}
            />
          </div>
          {planError ? <p className="text-sm text-red-600 dark:text-red-400">{planError}</p> : null}
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
  active,
  actionLabel,
  onClick,
  disabled
}: {
  title: string;
  description: string;
  active: boolean;
  actionLabel: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <div className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold">{title}</h4>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        {active ? (
          <span className="rounded-md bg-mint px-2 py-1 text-xs font-semibold text-pine dark:bg-emerald-950 dark:text-emerald-200">
            Active
          </span>
        ) : null}
      </div>
      <Button type="button" variant={active ? "secondary" : "primary"} className="mt-4 w-full" onClick={onClick} disabled={disabled}>
        {actionLabel}
      </Button>
    </div>
  );
}
