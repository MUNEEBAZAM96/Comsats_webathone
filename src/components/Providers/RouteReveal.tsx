"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type ComponentPropsWithoutRef } from "react";

const RouteReveal = (props: ComponentPropsWithoutRef<"div">) => {
  const pathname = usePathname();
  const surface = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const animation = surface.current?.animate(
      [
        { opacity: 0, translate: "0 6px" },
        { opacity: 1, translate: "0 0" },
      ],
      {
        duration: 280,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        fill: "both",
      },
    );
    return () => animation?.cancel();
  }, [pathname]);

  return (
    <div
      ref={surface}
      {...props}
    />
  );
};

export { RouteReveal };
