import { useCallback, useState } from "react";
import type { ListSelection } from "../types/common.types";

/**
 * Row selection for a `ListView`: selected ids plus an `allMatching` flag meaning "every row the
 * query matches", which is how a selection spans windows without loading the ids.
 * A `resetKey` change (the serialized query) clears both; a `windowKey` change (e.g. `${offset}:${limit}`)
 * clears the ids but keeps `allMatching`. Toggling a row while `allMatching` drops the flag and
 * selects `windowIds` minus that row. Callers still `clear()` after a successful bulk mutation.
 * `toRequest()` tells a bulk action whether to act on these ids or on all matching rows.
 */
export function useListSelection({
  resetKey,
  windowKey = "",
  total,
  canSelectAllMatching = false
}: {
  resetKey: string;
  windowKey?: string;
  total?: number;
  canSelectAllMatching?: boolean;
}) {
  const [state, setState] = useState({ resetKey, windowKey, ids: new Set<string>(), allMatching: false });
  let current = state;
  if (state.resetKey !== resetKey) {
    current = { resetKey, windowKey, ids: new Set(), allMatching: false };
    setState(current);
  } else if (state.windowKey !== windowKey) {
    current = { ...state, windowKey, ids: new Set() };
    setState(current);
  }
  const { ids, allMatching } = current;

  const toggle = useCallback(
    (id: string, windowIds: string[] = []) =>
      setState((prev) => {
        if (prev.allMatching) {
          const next = new Set(windowIds);
          next.delete(id);
          return { ...prev, ids: next, allMatching: false };
        }
        const next = new Set(prev.ids);
        if (!next.delete(id)) next.add(id);
        return { ...prev, ids: next };
      }),
    []
  );
  const setWindow = useCallback(
    (windowIds: string[], on: boolean) =>
      setState((prev) => {
        const next = new Set(prev.ids);
        for (const id of windowIds) {
          if (on) next.add(id);
          else next.delete(id);
        }
        return { ...prev, ids: next, allMatching: on ? prev.allMatching : false };
      }),
    []
  );
  const selectAllMatching = useCallback(
    () => setState((prev) => ({ ...prev, ids: new Set(), allMatching: true })),
    []
  );
  const clear = useCallback(() => setState((prev) => ({ ...prev, ids: new Set(), allMatching: false })), []);

  const selection: ListSelection = {
    count: allMatching ? (total ?? ids.size) : ids.size,
    allMatching,
    canSelectAllMatching,
    total,
    isSelected: (id) => allMatching || ids.has(id),
    toggle,
    setWindow,
    selectAllMatching,
    clear
  };

  return {
    ...selection,
    selectedIds: ids,
    toRequest: (): { mode: "ids"; ids: string[] } | { mode: "all" } =>
      allMatching ? { mode: "all" } : { mode: "ids", ids: [...ids] }
  };
}
