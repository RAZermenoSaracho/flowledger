import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../hooks/useAuth";
import * as usersClient from "../../../services/users.client";
import type { User } from "../../../types/users.types";

/**
 * Shared `["me"]` profile query. `syncUser` writes a fresh user into both the auth context and the
 * query cache; mutations in other profile hooks call it on success.
 */
export function useProfileUser() {
  const auth = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const response = await usersClient.getProfile();
      auth.setUser(response.user);
      return response.user;
    },
    initialData: auth.user ?? undefined
  });

  function syncUser(user: User) {
    auth.setUser(user);
    queryClient.setQueryData(["me"], user);
  }

  return { query, user: query.data, syncUser };
}
