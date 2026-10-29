import { useRef } from "react";

// The previous array while it holds the same items in the same order, so memoised rows
// (TrackRow gets the whole list) keep their props when only unrelated state changed.
export function useStableArray(items) {
  const ref = useRef(items);
  const prev = ref.current;
  if (prev !== items && (prev.length !== items.length || items.some((item, i) => item !== prev[i]))) ref.current = items;
  return ref.current;
}
