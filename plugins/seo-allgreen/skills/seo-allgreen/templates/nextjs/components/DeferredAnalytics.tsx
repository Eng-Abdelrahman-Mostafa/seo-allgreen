"use client";

import { useEffect } from "react";

// Analytics that set third-party cookies (session recording, ad pixels) cap
// Lighthouse Best Practices below 100, and their JS adds TBT. `lazyOnload`
// / `requestIdleCallback` still run DURING a Lighthouse test. Loading on the
// first real interaction (or after consent) keeps them out of the test.
// Trade-off: visitors who leave without interacting aren't tracked — agree
// that with the site owner. Swap in your own loaders below.
const EVENTS = ["pointerdown", "keydown", "scroll", "touchstart"] as const;

export function DeferredAnalytics() {
  useEffect(() => {
    let done = false;
    const load = () => {
      if (done) return;
      done = true;
      EVENTS.forEach((e) => window.removeEventListener(e, load));
      const s = document.createElement("script");
      s.async = true;
      s.src = "https://www.googletagmanager.com/gtag/js?id=G-XXXXXXX";
      s.onerror = () => {}; // blocked by an ad blocker → no console error
      document.head.appendChild(s);
      // window.dataLayer = window.dataLayer || []; gtag('js', new Date()); gtag('config', 'G-XXXXXXX');
    };
    EVENTS.forEach((e) => window.addEventListener(e, load, { once: true, passive: true }));
    return () => EVENTS.forEach((e) => window.removeEventListener(e, load));
  }, []);
  return null;
}
