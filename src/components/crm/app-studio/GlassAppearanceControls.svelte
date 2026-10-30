<script lang="ts">
  import type { GlassAppearance } from '../../../lib/ui/glassAppearance';
  export let value: GlassAppearance;
  export let accent = '#C6A95B';
  export let disabled = false;
  export let onCaptureUndo: () => void;
  const styles = [
    { key: 'standard', label: 'Standard', detail: 'Original solid surfaces.' },
    { key: 'layered', label: 'Layered glass', detail: 'Rich glass with more depth.' },
    { key: 'quiet', label: 'Quiet glass', detail: 'Clear glass with subtle depth.' },
    { key: 'pearl', label: 'Pearl glass', detail: 'Light surfaces with your program’s accent edge.' },
  ] as const;
  function change(patch: Partial<GlassAppearance>) {
    onCaptureUndo();
    value = { ...value, ...patch };
  }
</script>

<fieldset {disabled} class="space-y-4 rounded-xl border border-gray-200 p-4">
  <legend class="px-1 font-semibold text-gray-950">Glass appearance</legend>
  <p class="text-sm text-gray-600">Choose the surfaces for Home, Teams, Schedule, and Board. Review your changes, then select Publish App to apply them.</p>
  <div class="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Glass style">
    {#each styles as style}
      <label class="flex cursor-pointer items-start gap-3 rounded-lg border bg-white p-3 {value.style === style.key ? 'border-[var(--crm-brand-border)] ring-1 ring-[var(--crm-brand-border)]' : 'border-gray-200'}">
        <input type="radio" name="glass-style" value={style.key} checked={value.style === style.key} on:change={() => change({ style: style.key })} class="mt-1" />
        <span><span class="block text-sm font-semibold text-gray-950">{style.label}</span><span class="block text-sm text-gray-600">{style.detail}</span></span>
      </label>
    {/each}
  </div>
  {#if value.style !== 'standard'}
    <div class="space-y-2 rounded-xl border-2 p-4 text-gray-950" style:border-color={/^#[0-9a-f]{6}$/i.test(accent) ? accent : '#C6A95B'} style:background={value.style === 'pearl' ? 'linear-gradient(135deg, #edf4f3, #ffffff)' : '#e6eeee'}>
      <p class="text-base font-bold">Your program, your style</p><p class="text-sm">Readable content, clear photos, and an edge that follows your program’s accent color.</p>
    </div>
    {#if value.style !== 'pearl'}
      <label class="block text-sm font-medium text-gray-800">Glass tint
        <input type="color" value={value.tintColor} on:input={(event) => change({ tintColor: event.currentTarget.value })} class="mt-2 block h-10 w-16 rounded border border-gray-200" />
      </label>
      <label class="block text-sm font-medium text-gray-800">Tint strength: {Math.round(value.tintStrength * 100)}%
        <input type="range" min="0" max="0.55" step="0.01" value={value.tintStrength} on:input={(event) => change({ tintStrength: Number(event.currentTarget.value) })} class="mt-2 block w-full" />
      </label>
    {/if}
    <label class="block text-sm font-medium text-gray-800">Photo softness: {value.photoBlur === 0 ? 'Clear' : value.photoBlur}
      <input type="range" min="0" max="6" step="0.5" value={value.photoBlur} on:input={(event) => change({ photoBlur: Number(event.currentTarget.value) })} class="mt-2 block w-full" />
    </label>
    <p class="text-sm text-gray-600">Keep softness at Clear for sharp photos. Images keep their original colors.</p>
  {/if}
</fieldset>
