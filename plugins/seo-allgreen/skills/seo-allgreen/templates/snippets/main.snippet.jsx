// Fragments for src/main.jsx — mounting over pre-rendered HTML.
import { createRoot } from "react-dom/client";
import App from "./App"; // STATIC import: as a lazy chunk it adds a round trip
                         // during which the pre-rendered page is replaced.

// Only hide #root behind a splash when a splash actually exists. Pre-rendered
// pages ship without it (the prerender strips it), so adding the class
// unconditionally = permanent black screen. Also don't hard-code
// class="page-loading" on <body> in index.html unless something always removes it.
if (document.getElementById("splash-screen")) {
  document.body.classList.add("page-loading");
}

const mount = () => {
  const root = document.getElementById("root");
  if (!root) return;
  // createRoot, not hydrateRoot: a highly dynamic app (auth, feature flags,
  // animations) mismatches the snapshot and hydration can blank the page.
  // Don't clear innerHTML — React replaces it on first commit, so the static
  // content stays painted until then (FCP/LCP count it).
  createRoot(root).render(<App />);
};

// Let the browser paint the pre-rendered HTML first, then take over.
if (typeof requestAnimationFrame === "function") {
  requestAnimationFrame(() => requestAnimationFrame(mount));
} else {
  mount();
}

// In App: whatever removes the splash must ALWAYS un-hide #root and drop
// `page-loading`, even when no splash element exists — never `if (!splash) return;`.
