import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card } from "../components/Card";
import { routes } from "../constants/routes";
import { useAuth } from "../hooks/useAuth";
import { apiRequest } from "../services/api";
import type { User } from "../types/api";

export function ProfilePage() {
  const auth = useAuth();
  const profileQuery = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const response = await apiRequest<{ user: User }>("/users/me");
      auth.setUser(response.user);
      return response.user;
    },
    initialData: auth.user ?? undefined
  });

  const user = profileQuery.data;

  return (
    <Card className="max-w-2xl">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold">Profile</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Your account details for FlowLedger.
          </p>
        </div>
        <Link
          className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-pine px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink dark:hover:bg-emerald-700 sm:w-auto"
          to={routes.editProfile}
        >
          Edit profile
        </Link>
      </div>

      {profileQuery.isError ? (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">
          {profileQuery.error instanceof Error ? profileQuery.error.message : "Profile could not be loaded"}
        </p>
      ) : null}

      <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-slate-500 dark:text-slate-400">Name</dt>
          <dd className="mt-1 text-ink dark:text-slate-100">{user?.name ?? "Loading..."}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500 dark:text-slate-400">Email</dt>
          <dd className="mt-1 text-ink dark:text-slate-100">{user?.email ?? "Loading..."}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500 dark:text-slate-400">Member since</dt>
          <dd className="mt-1 text-ink dark:text-slate-100">
            {user ? new Date(user.createdAt).toLocaleDateString() : "Loading..."}
          </dd>
        </div>
      </dl>
    </Card>
  );
}
