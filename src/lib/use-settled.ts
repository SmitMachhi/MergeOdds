import { useEffect, useState } from "react";

/** False on page load. True once the fonts are in (or 400ms have passed) and the browser has painted two frames.
 *  Entrances wait for it, so the busy first moments of a page load do not swallow them. */
export function useSettled() {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    let raf = 0;
    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => setSettled(true));
      });
    };
    const cap = setTimeout(go, 400);
    document.fonts.ready.then(go);
    return () => {
      started = true;
      clearTimeout(cap);
      cancelAnimationFrame(raf);
    };
  }, []);
  return settled;
}
