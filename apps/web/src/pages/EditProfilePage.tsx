import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { TextInput } from "../components/FormField";
import { routes } from "../constants/routes";
import { useAuth } from "../hooks/useAuth";
import { apiRequest } from "../services/api";
import type { User } from "../types/api";

export function EditProfilePage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState(auth.user?.name ?? "");
  const [email, setEmail] = useState(auth.user?.email ?? "");
  const [error, setError] = useState<string | null>(null);

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
    }
  }, [profileQuery.data]);

  const updateProfile = useMutation({
    mutationFn: () =>
      apiRequest<{ user: User }>("/users/me", {
        method: "PATCH",
        body: { name, email }
      }),
    onSuccess: async (response) => {
      auth.setUser(response.user);
      queryClient.setQueryData(["me"], response.user);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate(routes.profile);
    }
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    try {
      await updateProfile.mutateAsync();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Profile could not be updated");
    }
  }

  const isLoading = profileQuery.isLoading && !profileQuery.data;

  return (
    <Card className="max-w-2xl">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold">Edit profile</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Update the basic account details used for sign in and display.
          </p>
        </div>
        <Link className="text-sm font-semibold text-pine dark:text-emerald-300" to={routes.profile}>
          Back to profile
        </Link>
      </div>

      <form className="mt-6 grid gap-4" onSubmit={submit}>
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
        {profileQuery.isError ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            {profileQuery.error instanceof Error ? profileQuery.error.message : "Profile could not be loaded"}
          </p>
        ) : null}
        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="submit" disabled={isLoading || updateProfile.isPending}>
            Save profile
          </Button>
          <Link
            className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-ink ring-1 ring-slate-200 transition hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700 dark:hover:bg-slate-800 sm:w-auto"
            to={routes.profile}
          >
            Cancel
          </Link>
        </div>
      </form>
    </Card>
  );
}
