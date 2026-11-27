"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

const AnimationProvider = ({ children }: { children: ReactNode }) => (
  <MotionConfig
    reducedMotion="user"
    transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
  >
    {children}
  </MotionConfig>
);

export default AnimationProvider;
