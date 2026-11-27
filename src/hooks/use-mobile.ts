import { useSyncExternalStore } from "react";

const mobileQuery = "(max-width: 767px)";

const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(mobileQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

const getSnapshot = () => window.matchMedia(mobileQuery).matches;
const getServerSnapshot = () => false;

export const useIsMobile = () =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

const tabletQuery = "(min-width: 768px) and (max-width: 1023px)";

const subscribeToTablet = (onChange: () => void) => {
  const media = window.matchMedia(tabletQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

const getTabletSnapshot = () => window.matchMedia(tabletQuery).matches;

export const useIsTablet = () =>
  useSyncExternalStore(subscribeToTablet, getTabletSnapshot, getServerSnapshot);
