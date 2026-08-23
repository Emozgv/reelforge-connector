import { useEffect } from "react";

/**
 * Freezes every continuous CSS animation in the app the instant the tab is
 * backgrounded (see the html[data-tab-hidden] rule in index.css) — infinite
 * decorative animations otherwise keep the GPU compositor active even when
 * nobody can see the page, which costs real battery/heat for no visible
 * benefit.
 */
export function usePauseAnimationsWhenHidden() {
  useEffect(() => {
    function apply() {
      document.documentElement.dataset.tabHidden = String(document.hidden);
    }
    apply();
    document.addEventListener("visibilitychange", apply);
    return () => document.removeEventListener("visibilitychange", apply);
  }, []);
}
