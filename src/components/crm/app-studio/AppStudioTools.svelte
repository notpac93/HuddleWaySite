<script lang="ts">
  export let open = false;
  export let focusEnabled = true;
  function focusPanel(node: HTMLElement, visible: boolean) {
    const update = (value: boolean) => { if (value) node.focus(); };
    update(visible);
    return { update };
  }
</script>

<div class="app-tools-overlay" hidden={!open} style:display={open ? 'flex' : 'none'}>
  <div role="region" aria-label="Edit app" class="app-tools-dialog" tabindex="-1" use:focusPanel={open && focusEnabled}>
    <slot />
  </div>
</div>

<style>
  .app-tools-overlay { position: fixed; inset: 0 0 0 auto; width: min(440px, 45vw); z-index: 40; align-items: stretch; padding: 0; pointer-events: none; }
  .app-tools-dialog { pointer-events: auto; width: 100%; height: 100%; min-height: 0; overflow: hidden; border-left: 1px solid #dce2eb; background: white; box-shadow: -4px 0 20px #0001; }
  @media (max-width: 767px) {
    .app-tools-overlay { inset: auto 0 0; width: 100%; height: 62dvh; }
    .app-tools-dialog { border-left: 0; border-top: 1px solid #dce2eb; border-radius: 16px 16px 0 0; }
  }
</style>
