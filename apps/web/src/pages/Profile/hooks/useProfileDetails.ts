import { useEffect, useMemo, useRef, useState } from "react";
import { useCurrenciesQuery } from "../../../components/CurrencySelect";
import { useFormDraft } from "../../../hooks/useFormDraft";
import * as authClient from "../../../services/auth.client";
import * as usersClient from "../../../services/users.client";
import type { ProfileDraft } from "../types/profile.types";
import { validateProfile } from "../utils/profileValidation";
import { useProfileUser } from "./useProfileUser";

const EMPTY_PROFILE: ProfileDraft = { name: "", email: "", preferredCurrency: "", avatarFile: null };

/**
 * Profile adapter over `useFormDraft`: supplies Profile's `initial`, `validate` and `save` (email,
 * then profile, then avatar) plus display values (avatar URL, initials, currency label, member-since).
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
            preferredCurrency: user.preferredCurrency ?? "",
            avatarFile: null
          }
        : null,
    [user]
  );

  const draft = useFormDraft<ProfileDraft>({
    initial,
    validate: validateProfile,
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
          preferredCurrency: values.preferredCurrency || null
        });
        if (values.avatarFile) saved = await usersClient.uploadAvatar(values.avatarFile);
        syncUser(saved.user);
        setIsPasswordPromptOpen(false);
      } finally {
        passwordRef.current = undefined;
      }
    }
  });

  const values = initial ? draft.values : EMPTY_PROFILE;

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
    draft,
    values,
    onSave,
    isPasswordPromptOpen,
    confirmEmailChange,
    closePasswordPrompt
  };
}
