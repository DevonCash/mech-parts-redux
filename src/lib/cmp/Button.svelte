<script lang="ts">
  import { parseCommandId, commandMeta } from "../commands";

  let {
    symbol,
    label,
    commandId,
    iconOnly,
    active,

    children,
    ...restProps
  }: {
    symbol?: string;
    label?: string;
    commandId: string;
    iconOnly?: boolean;
    active?: boolean;

    children?: () => any;
    [key: string]: any;
  } = $props();

  let meta = $derived.by(() => {
    const meta = commandMeta[commandId];
    if (!meta && !label) {
      console.warn(`Command ${commandId} not found; label required`);
    }
    return meta;
  });

  let { el: commandfor, cmd: command } = $derived.by(() =>
    parseCommandId(commandId),
  );
</script>

<button
  {...restProps}
  class:active
  aria-label={label ?? meta?.label}
  {commandfor}
  {command}
>
  {#if !children}
    {#if symbol || meta?.symbol}
      <span aria-hidden="true">{symbol ?? meta?.symbol}</span>
    {/if}
    {#if !iconOnly}
      <span>{label ?? meta?.label}</span>
    {/if}
  {:else}
    {@render children()}
  {/if}
</button>