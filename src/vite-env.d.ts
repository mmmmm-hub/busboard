/// <reference types="vite/client" />

// Badging API (標準のlib.dom.d.tsにまだ含まれていないため補完)
interface Navigator {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}
