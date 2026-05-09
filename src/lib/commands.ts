import type { Attachment } from "svelte/attachments";

type CommandEvent = Event & {
  command: string;
};

export const commandMeta: Record<string, { label: string; symbol: string }> = {
  "game-time.pause": {
    label: "Pause",
    symbol: "⏸",
  },
  "game-time.toggle": {
    label: "Toggle Time",
    symbol: "⏯",
  },
  "game-time.play": {
    label: "Play",
    symbol: "▶",
  },
  "game-time.fast-forward": {
    label: "Fast Forward",
    symbol: "⏩︎",
  },
  "pause-menu.resume": {
    label: "Resume Game",
    symbol: "▶",
  },
} as const;

const builtins = new Set([
  "show-modal",
  "close",
  "request-close",
  "show-popover",
  "hide-popover",
  "toggle-popover",
]);
export const parseCommandId = (id: string) => {
  const [target, action] = id.split(".");
  return {
    el: `${target}`,
    cmd: !builtins.has(action) ? `--${action}` : action,
  };
};

export const registerCommands =
  (cmds: Record<string, Function>): Attachment =>
  (el: Element) => {
    const handleCmd = (event: CommandEvent) => {
      cmds[event.command]?.(event);
    };
    el.addEventListener("command", handleCmd);

    return () => {
      el.removeEventListener("command", handleCmd);
    };
  };
