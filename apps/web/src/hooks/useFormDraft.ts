import { useEffect, useRef, useState } from "react";
import type { FormDraft, FormErrors, UseFormDraftOptions } from "../types/common.types";
import { structuralEqual } from "../utils/structuralEqual";

function changedKeysOf<T extends object>(draft: T | null, baseline: T | null) {
  if (!draft || !baseline) return [];
  return (Object.keys(draft) as (keyof T & string)[]).filter(
    (key) => !structuralEqual(draft[key], baseline[key])
  );
}

/**
 * The form state machine behind every editable record view: a local draft over `initial`, per-key
 * dirty tracking (structural equality, so retyping the saved value is clean), a validation gate,
 * one batch `save` and a `beforeunload` guard while dirty. Nothing persists until `save()`.
 *
 * When `initial` changes the draft rebases onto it only if the draft is clean, so a refetch never
 * clobbers edits. After a successful save the saved draft becomes the clean baseline until
 * `initial` next changes; if `initial` changed while `save` ran (a refetch with server-assigned
 * values), the draft and baseline become that fresher `initial` instead. A save rejection keeps the draft and sets `saveError`; when the
 * rejection carries a string `field`, the message also lands in `fieldErrors` for that field.
 * `fieldErrors` only contains touched fields (or all of them after a blocked save attempt).
 * `values` is an empty object while `initial` is `null`.
 */
export function useFormDraft<T extends object>({
  initial,
  validate,
  save: persist
}: UseFormDraftOptions<T>): FormDraft<T> {
  const [prevInitial, setPrevInitial] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<FormErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const initialRef = useRef(initial);
  initialRef.current = initial;

  if (!structuralEqual(prevInitial, initial)) {
    const clean = changedKeysOf(draft, baseline).length === 0;
    setPrevInitial(initial);
    setBaseline(initial);
    if (clean) setDraft(initial);
  }

  const changedKeys = changedKeysOf(draft, baseline);
  const isDirty = changedKeys.length > 0;

  useEffect(() => {
    if (!isDirty) return;
    const guard = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [isDirty]);

  const errors = draft ? validate(draft) : {};
  const fieldErrors: FormErrors = { ...serverErrors };
  for (const [key, message] of Object.entries(errors)) {
    if (submitted || touched.has(key.split(".")[0]!)) fieldErrors[key] ??= message;
  }

  function touch(key: string) {
    setTouched((current) => new Set(current).add(key));
    setServerErrors({});
  }

  function setField<K extends keyof T>(key: K, value: T[K]) {
    setDraft((current) => current && { ...current, [key]: value });
    touch(String(key));
  }

  function update(fn: (draft: T) => T) {
    setDraft((current) => current && fn(current));
    setServerErrors({});
  }

  function revertField(key: keyof T) {
    if (baseline) setDraft((current) => current && { ...current, [key]: baseline[key] });
    touch(String(key));
  }

  function cancel() {
    setDraft(baseline);
    setTouched(new Set());
    setSubmitted(false);
    setServerErrors({});
    setSaveError(null);
  }

  async function save() {
    if (!draft || savingRef.current || !isDirty) return;
    if (Object.keys(errors).length > 0) {
      setSubmitted(true);
      return;
    }
    savingRef.current = true;
    setIsSaving(true);
    setSaveError(null);
    const initialAtStart = initialRef.current;
    try {
      await persist(draft, changedKeys);
      const refreshed = initialRef.current;
      if (refreshed && !structuralEqual(refreshed, initialAtStart)) {
        setBaseline(refreshed);
        setDraft(refreshed);
      } else {
        setBaseline(draft);
      }
      setTouched(new Set());
      setSubmitted(false);
      setServerErrors({});
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Changes could not be saved";
      setSaveError(message);
      const field = (caught as { field?: unknown } | null)?.field;
      if (typeof field === "string") setServerErrors({ [field]: message });
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  return {
    values: draft ?? ({} as T),
    setField,
    update,
    revertField,
    cancel,
    save,
    isDirty,
    changedKeys,
    isSaving,
    fieldErrors,
    saveError
  };
}
