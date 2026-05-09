<script lang="ts">
  import { fromStore } from "svelte/store";
  import { deleteGame, games as gamesStore } from "./game";
  import Button from "./cmp/Button.svelte";

  let { startGame } = $props();

  let games = fromStore(gamesStore);
</script>

<menu>
  <li>
    <Button commandId="new-game.show-modal" label="New Game" />
  </li>
  <li>
    <button
      commandfor="load-game"
      command="show-modal"
      disabled={!games.current.length}>Load Game</button
    >
  </li>
</menu>

<dialog id="new-game">
  <h2>New Game</h2>

  <footer>
    <button command="close" commandfor="new-game">Close</button>
    <button onclick={() => startGame(`game:${crypto.randomUUID()}`)}
      >Start</button
    >
  </footer>
</dialog>

<dialog id="load-game">
  <h2>Load Game</h2>
  <table>
    <tbody>
      {#each games.current as gameId}
        <tr>
          <td>{gameId}</td>
          <td><button onclick={() => startGame(gameId)}>▶</button></td>
          <td><button onclick={() => deleteGame(gameId)}>×</button></td>
        </tr>
      {/each}
    </tbody>
  </table>
  <footer>
    <button command="close" commandfor="load-game">Close</button>
  </footer>
</dialog>
