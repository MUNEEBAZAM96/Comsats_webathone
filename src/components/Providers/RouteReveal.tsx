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
        { opacity: 0.76, translate: "0 7px" },
        { opacity: 1, translate: "0 0" },
      ],
      { duration: 260, easing: "cubic-bezier(.2,.75,.28,1)" },
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
