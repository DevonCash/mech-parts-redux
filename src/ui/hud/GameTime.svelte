<script lang="ts">
  import { registerCommands } from "../../commands";
  import Button from "../shared/Button.svelte";
  import { gameTime, timeScale } from "../../stores/time";

  const MARS_EPOCH = new Date("2370-01-01").getTime();

  let currentTime = $state(gameTime.get());
  let currentScale = $state(timeScale.get());

  $effect(() => {
    const unsubTime = gameTime.subscribe((v) => (currentTime = v));
    const unsubScale = timeScale.subscribe((v) => (currentScale = v));
    return () => { unsubTime(); unsubScale(); };
  });

  let date = $derived(
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(MARS_EPOCH + currentTime)),
  );

  function setGameSpeed(speed: number) {
    timeScale.set(speed);
  }
</script>

<div
  class="time"
  id="game-time"
  {@attach registerCommands({
    "--pause": () => setGameSpeed(0),
    "--play": () => setGameSpeed(1),
    "--fast-forward": () => setGameSpeed(2),
    "--toggle": () => setGameSpeed(currentScale === 0 ? 1 : 0),
  })}
>
  <time>{date}</time>
  <menu>
    <Button commandId="game-time.pause" iconOnly active={currentScale === 0} />
    <Button commandId="game-time.play" iconOnly active={currentScale === 1} />
    <Button
      commandId="game-time.fast-forward"
      iconOnly
      active={currentScale === 2}
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
