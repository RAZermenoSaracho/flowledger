import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useCurrenciesQuery } from "../../../components/CurrencySelect";
import * as usersClient from "../../../services/users.client";
import type { ProfileDraft, ProfileDraftField } from "../types/profile.types";
import { useProfileUser } from "./useProfileUser";

/**
 * Read model for the profile header: the user plus derived display values (avatar URL, initials,
 * currency label, member-since date) plus the inline-edit draft. Owned by `ProfileHeader`, which stays
 * mounted across tab switches so drafts survive them. Nothing persists until `save()`; while dirty a
 * `beforeunload` guard is registered. `save()` is a no-op when `fieldErrors` is non-empty.
 */
export function useProfileDetails() {
  const { query, user, syncUser } = useProfileUser();
  const currenciesQuery = useCurrenciesQuery();
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<Partial<ProfileDraft>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  const original: ProfileDraft = {
    name: user?.name ?? "",
    email: user?.email ?? "",
    preferredCurrency: user?.preferredCurrency ?? ""
  };
  const values: ProfileDraft = { ...original, ...draft };
  const isDirty = Object.keys(draft).length > 0 || avatarFile !== null;

  const fieldErrors: Partial<Record<ProfileDraftField, string>> = {};
  if (draft.name !== undefined && !values.name.trim())
    fieldErrors.name = "Name is required";
  if (
    draft.email !== undefined &&
    !/^\S+@\S+\.\S+$/.test(values.email.trim())
  ) {
    fieldErrors.email = "Enter a valid email address";
  }

  useEffect(() => {
    if (!isDirty) return;
    const guard = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [isDirty]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      let saved = await usersClient.updateProfile({
        name: values.name.trim(),
        email: values.email.trim(),
        preferredCurrency: values.preferredCurrency || null
      });
      if (avatarFile) saved = await usersClient.uploadAvatar(avatarFile);
      return saved;
    },
    onSuccess: (response) => {
      syncUser(response.user);
      setDraft({});
      setAvatarFile(null);
      setSaveError(null);
    },
    onError: (caught) =>
      setSaveError(
        caught instanceof Error
          ? caught.message
          : "Profile could not be updated"
      )
  });

  /** Sets a draft value; setting it back to the original value drops it so `isDirty` stays accurate. */
  function setField(field: ProfileDraftField, value: string) {
    setDraft((current) => {
      const { [field]: _removed, ...rest } = current;
      return value === original[field] ? rest : { ...rest, [field]: value };
    });
  }

  /** Reverts one field to its saved value. */
  function revertField(field: ProfileDraftField) {
    setField(field, original[field]);
  }

  /** Discards every draft value and the pending avatar. */
  function cancel() {
    setDraft({});
    setAvatarFile(null);
    setSaveError(null);
  }

  /** Persists the draft (profile first, then avatar); no-op while invalid or already saving. */
  function save() {
    if (Object.keys(fieldErrors).length > 0 || saveMutation.isPending) return;
    setSaveError(null);
    saveMutation.mutate();
  }

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
    avatarFile,
    setAvatarFile,
    values,
    isDirty,
    isSaving: saveMutation.isPending,
    saveError,
    fieldErrors,
    setField,
    revertField,
    save,
    cancel
  };
}
