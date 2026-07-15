import { useState } from "react";

/**
 * Closes a modal once a Server Action's state transitions to success.
 *
 * Deliberately NOT a useEffect — React's own guidance ("You Might Not Need
 * an Effect") recommends adjusting state during render when responding to
 * a prop/state change like this, rather than calling setState inside an
 * effect body (which the react-hooks/set-state-in-effect rule correctly
 * flags, since it risks cascading renders). Tracking the previous value
 * and comparing during render is the supported alternative — it still
 * only fires once per actual transition, not on every render.
 */
export function useCloseModalOnSuccess(success: boolean | undefined, setOpen: (open: boolean) => void) {
  const [prevSuccess, setPrevSuccess] = useState(success);
  if (success !== prevSuccess) {
    setPrevSuccess(success);
    if (success) setOpen(false);
  }
}
