import type { Metadata } from "next";
import ToastProvider from "@/components/Providers/ToastProvider";
import ThemeProvider from "@/components/Providers/ThemeProvider";
import AnimationProvider from "@/components/Providers/AnimationProvider";
import { geistMono, inter, plusJakartaSans } from "@/lib/fonts";
import { LayoutProps } from "@/lib/types";
import { cn } from "@/lib/utils";
import "./globals.css";

export const metadata: Metadata = {
  title: { template: "%s | ExamGuard", default: "ExamGuard" },
  description: "ExamGuard examination management platform",
};

const RootLayout = ({ children }: LayoutProps) => {
  return (
    <html
      lang="en"
      className={cn(
        "antialiased",
        "font-sans",
        inter.variable,
        plusJakartaSans.variable,
        geistMono.variable,
      )}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider attribute={"class"} defaultTheme="dark" enableSystem={false}>
          <AnimationProvider>{children}</AnimationProvider>
          <ToastProvider />
        </ThemeProvider>
      </body>
    </html>
  );
};

export default RootLayout;
