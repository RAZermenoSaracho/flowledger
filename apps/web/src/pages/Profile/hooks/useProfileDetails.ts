import { useQuery } from "@tanstack/react-query";
import { usernameSchema } from "@flowledger/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCurrenciesQuery } from "../../../components/CurrencySelect";
import { useFormDraft } from "../../../hooks/useFormDraft";
import * as authClient from "../../../services/auth.client";
import * as usersClient from "../../../services/users.client";
import type { ProfileDraft, UsernameStatus } from "../types/profile.types";
import { validateProfile } from "../utils/profileValidation";
import { useProfileUser } from "./useProfileUser";

const EMPTY_PROFILE: ProfileDraft = {
  name: "",
  email: "",
  username: "",
  identityVisibility: "username_only",
  preferredCurrency: "",
  avatarFile: null
};
const AVAILABILITY_DEBOUNCE_MS = 400;

/**
 * Profile adapter over `useFormDraft`: supplies Profile's `initial`, `validate` and `save` (email,
 * then profile, then avatar) plus display values (avatar URL, initials, currency label, member-since).
 * `usernameStatus` reports the debounced availability check of an edited username; a taken name
 * becomes a `username` field error so Save stays disabled, and a concurrent claim rejected by the
 * server (409) lands on the same field with the draft kept.
 * Owned by `ProfilePage`, which stays mounted across tab switches so the draft survives them.
 * `draft` is the form hook result for `FormView`; pass `onSave` as the view's `onSave`: when the
 * email changed it opens the password prompt (`isPasswordPromptOpen`) instead of saving, and
 * `confirmEmailChange(password)` then saves with that password. `values` is the draft with
 * empty defaults while the user loads.
 */
export function useProfileDetails() {
  const { query, user, syncUser } = useProfileUser();
  const currenciesQuery = useCurrenciesQuery();
  const [isPasswordPromptOpen, setIsPasswordPromptOpen] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const passwordRef = useRef<string | undefined>(undefined);

  const initial = useMemo<ProfileDraft | null>(
    () =>
      user
        ? {
            name: user.name,
            email: user.email,
            username: user.username,
            identityVisibility: user.identityVisibility,
            preferredCurrency: user.preferredCurrency ?? "",
            avatarFile: null
          }
        : null,
    [user]
  );

  const [takenUsername, setTakenUsername] = useState<string | null>(null);

  const draft = useFormDraft<ProfileDraft>({
    initial,
    validate: (values) => validateProfile(values, takenUsername),
    save: async (values, changedKeys) => {
      try {
        let email = values.email.trim();
        if (changedKeys.includes("email") && passwordRef.current !== undefined) {
          const changed = await usersClient.updateEmail({
            email,
            currentPassword: passwordRef.current
          });
          authClient.setToken(changed.token);
          syncUser(changed.user);
          email = changed.user.email;
        }
        let saved = await usersClient.updateProfile({
          name: values.name.trim(),
          email,
          preferredCurrency: values.preferredCurrency || null,
          ...(changedKeys.includes("username") ? { username: values.username.trim() } : {}),
          ...(changedKeys.includes("identityVisibility")
            ? { identityVisibility: values.identityVisibility }
            : {})
        });
        if (values.avatarFile) saved = await usersClient.uploadAvatar(values.avatarFile);
        syncUser(saved.user);
        setIsPasswordPromptOpen(false);
      } catch (error) {
        const fieldError = usersClient.getFieldError(error);
        if (fieldError) throw Object.assign(new Error(fieldError.message), { field: fieldError.field });
        throw error;
      } finally {
        passwordRef.current = undefined;
      }
    }
  });

  const values = initial ? draft.values : EMPTY_PROFILE;

  const [debouncedUsername, setDebouncedUsername] = useState(values.username);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedUsername(values.username), AVAILABILITY_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [values.username]);
  const parsedUsername = usernameSchema.safeParse(debouncedUsername);
  const candidate = parsedUsername.success ? parsedUsername.data : null;
  const isCandidateNew = Boolean(user && candidate && candidate !== user.username);
  const availabilityQuery = useQuery({
    queryKey: ["username-availability", candidate],
    enabled: isCandidateNew,
    queryFn: () => usersClient.checkUsernameAvailability(candidate!)
  });
  useEffect(() => {
    if (availabilityQuery.data && !availabilityQuery.data.available) {
      setTakenUsername(availabilityQuery.data.username);
    }
  }, [availabilityQuery.data]);
  const typedUsername = usernameSchema.safeParse(values.username);
  const usernameStatus: UsernameStatus = !typedUsername.success
    ? "invalid"
    : typedUsername.data === user?.username
      ? "unchanged"
      : typedUsername.data !== candidate || availabilityQuery.isFetching || !availabilityQuery.data
        ? "checking"
        : availabilityQuery.data.available
          ? "available"
          : "taken";

  /** Save handler for `FormView`: opens the password prompt when the email changed, otherwise saves. */
  async function onSave() {
    if (draft.isSaving) return;
    if (draft.changedKeys.includes("email")) {
      if (Object.keys(draft.fieldErrors).length === 0) setIsPasswordPromptOpen(true);
      return;
    }
    await draft.save();
  }

  /** Saves with the user's current password; a rejection leaves the prompt open with `draft.saveError` set. */
  async function confirmEmailChange(currentPassword: string) {
    if (draft.isSaving) return;
    passwordRef.current = currentPassword;
    await draft.save();
  }

  /** Closes the password prompt without saving, keeping the draft. */
  function closePasswordPrompt() {
    setIsPasswordPromptOpen(false);
  }

  const avatarFile = values.avatarFile;
  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [avatarFile]);

  const allCurrencies = currenciesQuery.data?.currencies ?? [];
  const currencyLabel = (() => {
    if (!user?.preferredCurrency) return "Not set";
    const c = allCurrencies.find((cur) => cur.code === user.preferredCurrency);
    if (!c) return user.preferredCurrency;
    return c.type === "fiat" ? `${c.code} — ${c.name}` : c.code;
  })();

  const initials = (user?.name ?? "FL")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return {
    user,
    isLoading: query.isLoading && !user,
    errorMessage: query.isError
      ? query.error instanceof Error
        ? query.error.message
        : "Profile could not be loaded"
      : null,
    avatarUrl: avatarPreviewUrl ?? usersClient.getAvatarUrl(user?.avatarUrl),
    initials,
    currencyLabel,
    memberSince: user ? new Date(user.createdAt).toLocaleDateString() : null,
    syncUser,
    usernameStatus,
    draft,
    values,
    onSave,
    isPasswordPromptOpen,
    confirmEmailChange,
    closePasswordPrompt
  };
}
