import { persistentAtom } from "@nanostores/persistent";
import { parseCommandId } from "./commands";
import { computed } from "nanostores";

const keybinds = persistentAtom(
  "keybinds",
  {
    "pause-menu.toggle": "Escape",
    "game-time.toggle": "Space",
  },
  {
    encode: (value) => JSON.stringify(value),
    decode: (value) => JSON.parse(value),
  },
);

const commandMap = computed(keybinds, (keybinds) => {
  return Object.entries(keybinds).reduce(
    (acc, [cmd, key]) => {
      acc[key] = parseCommandId(cmd);
      return acc;
    },
    {} as Record<string, { el: string; cmd: string }>,
  );
});

const handleKeydown = (e: KeyboardEvent) => {
  const command = commandMap.get()[e.code];
  if(!command) return;
  const { el, cmd } = command;
  e.preventDefault();
  document
    .querySelector("#" + el)
    ?.dispatchEvent(new CommandEvent("command", { command: cmd }));
};

export { keybinds, commandMap, handleKeydown };
