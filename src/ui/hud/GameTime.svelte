<script lang="ts">
  import { registerCommands } from "../../commands";
  import Button from "../shared/Button.svelte";
  import { gameTime, timeScale } from "../../stores/time";

  const MARS_EPOCH = new Date("2370-01-01").getTime();
  // Constructing Intl.DateTimeFormat is expensive — build it once.
  const DATE_FMT = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  let currentTime = $state(gameTime.get());
  let currentScale = $state(timeScale.get());

  $effect(() => {
    const unsubTime = gameTime.subscribe((v) => (currentTime = v));
    const unsubScale = timeScale.subscribe((v) => (currentScale = v));
    return () => { unsubTime(); unsubScale(); };
  });

  // The display only shows minutes — bucket first so formatting runs
  // once per displayed game-minute, not on every tick batch.
  let minute = $derived(Math.floor(currentTime / 60_000));
  let date = $derived(DATE_FMT.format(new Date(MARS_EPOCH + minute * 60_000)));

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
    "--fast-forward": () => setGameSpeed(10),
    "--cruise": () => setGameSpeed(100),
    "--burn": () => setGameSpeed(1000),
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
      active={currentScale === 10}
    />
    <Button commandId="game-time.cruise" iconOnly active={currentScale === 100} />
    <Button commandId="game-time.burn" iconOnly active={currentScale === 1000} />
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
