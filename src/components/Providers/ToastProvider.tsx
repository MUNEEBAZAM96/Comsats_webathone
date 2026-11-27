"use client";

import { Toaster } from "sonner";

const ToastProvider = () => (
  <Toaster
    position="bottom-right"
    closeButton
    toastOptions={{
      classNames: {
        toast: "!border-border !bg-card !text-card-foreground",
        success: "[&_[data-icon]]:text-success",
        error: "[&_[data-icon]]:text-destructive",
      },
    }}
  />
);

export default ToastProvider;
