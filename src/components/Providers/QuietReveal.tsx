"use client";

import { useAnimate, useReducedMotion } from "motion/react";
import { useEffect, type ComponentPropsWithoutRef } from "react";

const QuietReveal = ({
  children,
  className,
}: ComponentPropsWithoutRef<"div">) => {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion !== false || !scope.current) return;
    const animation = animate(scope.current, { opacity: [0.65, 1], y: [8, 0] }, {
      duration: 0.28,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => animation.stop();
  }, [animate, reduceMotion, scope]);

  return <div ref={scope} className={className}>{children}</div>;
};

export { QuietReveal };
