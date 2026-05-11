<script lang="ts">
  import { registerCommands } from "../../commands";
  import Button from "../shared/Button.svelte";
  import { timeScale } from "../../stores/time";
</script>

<button command="--toggle" commandfor="pause-menu">☰</button>
<dialog
  id="pause-menu"
  {@attach registerCommands({
    "--toggle": (e) => {
      const dialog = e.target as HTMLDialogElement;
      if (dialog.open) {
        timeScale.set(1);
        dialog.close();
      } else {
        timeScale.set(0);
        setTimeout(() => dialog.showModal(), 0);
      }
    },
    "--resume": (e) => {
      const dialog = e.target as HTMLDialogElement;
      timeScale.set(1);
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
