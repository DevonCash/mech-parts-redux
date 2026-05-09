<script lang="ts">
  import { registerCommands } from "../commands";
  import Button from "./Button.svelte";
  let { game } = $props();
</script>

<button command="--toggle" commandfor="pause-menu">☰</button>
<dialog
  id="pause-menu"
  {@attach registerCommands({
    "--toggle": (e) => {
      const dialog = e.target as HTMLDialogElement;
      if (dialog.open) {
        game.setGameSpeed(1);
        dialog.close();
      } else {
        game.setGameSpeed(0);
        setTimeout(() => dialog.showModal(), 0);
      }
    },
    "--resume": (e) => {
      const dialog = e.target as HTMLDialogElement;
      game.setGameSpeed(1);
      dialog.close();
    },
  })}
>
  <h2>Paused</h2>
  <menu>
    <li>
      <Button commandId="pause-menu.resume" />
    </li>
    <li>
      <button
        onclick={() => {
          /* Exit game logic */
        }}>Exit</button
      >
    </li>
  </menu>
</dialog>
