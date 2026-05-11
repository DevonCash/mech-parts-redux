<script lang="ts">
  import Button from "../shared/Button.svelte";

  let { startGame } = $props();
</script>

<menu>
  <li>
    <Button commandId="new-game.show-modal" label="New Game" />
  </li>
</menu>

<dialog id="new-game">
  <h2>New Game</h2>

  <footer>
    <button command="close" commandfor="new-game">Close</button>
    <button onclick={() => startGame()}>Start</button>
  </footer>
</dialog>
