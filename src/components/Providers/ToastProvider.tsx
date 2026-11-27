"use client";

import {
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Toaster } from "sonner";

const ToastProvider = () => (
  <Toaster
    position="bottom-right"
    closeButton
    gap={10}
    offset={24}
    mobileOffset={16}
    icons={{
      success: <CircleCheckIcon aria-hidden="true" />,
      error: <CircleAlertIcon aria-hidden="true" />,
      warning: <TriangleAlertIcon aria-hidden="true" />,
      info: <InfoIcon aria-hidden="true" />,
    }}
    toastOptions={{
      classNames: {
        toast: "exam-toast",
        success: "exam-toast-success",
        error: "exam-toast-error",
        warning: "exam-toast-warning",
        info: "exam-toast-info",
      },
    }}
  />
);

export default ToastProvider;
