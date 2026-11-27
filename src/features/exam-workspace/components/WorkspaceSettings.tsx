"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/shadcnui/button";
import { useTheme } from "next-themes";
import { z } from "zod";

const schema = z.object({
  density: z.enum(["comfortable", "compact"]),
  font: z.enum(["standard", "large"]),
  navigation: z.enum(["sidebar", "drawer"]),
  instructions: z.boolean(),
  scratchpad: z.boolean(),
});

type Preferences = z.infer<typeof schema>;
const defaults: Preferences = {
  density: "comfortable",
  font: "standard",
  navigation: "sidebar",
  instructions: false,
  scratchpad: true,
};
const key = "exam-workspace-preferences";
let memory: string | null = null;
const subscribe = (notify: () => void) => {
  window.addEventListener("storage", notify);
  window.addEventListener(key, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(key, notify);
  };
};
const read = () => {
  try {
    return memory ?? localStorage.getItem(key);
  } catch {
    return memory;
  }
};
const write = (preferences: Preferences) => {
  const value = JSON.stringify(preferences);
  try {
    localStorage.setItem(key, value);
    memory = null;
  } catch {
    memory = value;
  }
  window.dispatchEvent(new Event(key));
};
const readServer = () => null;
export const parseWorkspacePreferences = (raw: string | null) => {
  try {
    return schema.safeParse(JSON.parse(raw ?? "null")).data ?? defaults;
  } catch {
    return defaults;
  }
};
export const useWorkspacePreferences = () =>
  parseWorkspacePreferences(useSyncExternalStore(subscribe, read, readServer));

export const WorkspaceSettings = ({
  preferences,
}: {
  preferences: Preferences;
}) => {
  const { theme, setTheme } = useTheme();
  return (
    <details className="rounded-lg border bg-card p-3">
      <summary className="cursor-pointer font-medium">
        Workspace preferences
      </summary>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
        <label className="flex items-center gap-2">
          Density
          <select
            className="rounded border bg-background p-2"
            value={preferences.density}
            onChange={(event) =>
              write({
                ...preferences,
                density:
                  event.target.value === "compact" ? "compact" : "comfortable",
              })
            }
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          Text size
          <select
            className="rounded border bg-background p-2"
            value={preferences.font}
            onChange={(event) =>
              write({
                ...preferences,
                font: event.target.value === "large" ? "large" : "standard",
              })
            }
          >
            <option value="standard">Standard</option>
            <option value="large">Large</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          Navigation
          <select
            className="rounded border bg-background p-2"
            value={preferences.navigation}
            onChange={(event) =>
              write({
                ...preferences,
                navigation:
                  event.target.value === "drawer" ? "drawer" : "sidebar",
              })
            }
          >
            <option value="sidebar">Sidebar</option>
            <option value="drawer">Drawer</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          Theme
          <select
            suppressHydrationWarning
            className="rounded border bg-background p-2"
            value={theme ?? "dark"}
            onChange={(event) => setTheme(event.target.value)}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={preferences.instructions}
            onChange={(event) =>
              write({ ...preferences, instructions: event.target.checked })
            }
          />{" "}
          Show instructions
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={preferences.scratchpad}
            onChange={(event) =>
              write({ ...preferences, scratchpad: event.target.checked })
            }
          />{" "}
          Show scratchpad
        </label>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            write(defaults);
            setTheme("dark");
          }}
        >
          Reset defaults
        </Button>
      </div>
    </details>
  );
};
