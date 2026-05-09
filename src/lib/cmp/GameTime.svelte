<script lang="ts">
  import { registerCommands } from "../commands";
  import Button from "./Button.svelte";
  let { state, setGameSpeed } = $props();

  const MARS_EPOCH = new Date("2370-01-01").getTime();

  let date = $derived(
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(MARS_EPOCH + state.time * 1000)),
  );
</script>

<div
  class="time"
  id="game-time"
  {@attach registerCommands({
    "--pause": () => setGameSpeed(0),
    "--play": () => setGameSpeed(1),
    "--fast-forward": () => setGameSpeed(2),
    "--toggle": () => setGameSpeed(state.timeScale === 0 ? 1 : 0),
  })}
>
  <time>{date}</time>
  <menu>
    <Button commandId="game-time.pause" iconOnly active={state.timeScale === 0} />
    <Button commandId="game-time.play" iconOnly active={state.timeScale === 1} />
    <Button
      commandId="game-time.fast-forward"
      iconOnly
      active={state.timeScale === 2}
    />
  </menu>
</div>

<style>
  .time {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 1ch;
  }
</style>
