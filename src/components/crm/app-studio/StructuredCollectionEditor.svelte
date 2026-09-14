<script lang="ts">
  export let fieldId: string;
  export let label: string;
  export let type: string;
  export let value: unknown;
  export let disabled = false;
  export let onChange: (value: unknown[]) => void;
  export let onFocus: () => void;

  let expandedIndex = 0;

  $: rows = Array.isArray(value)
    ? value.filter((item) => item && typeof item === 'object').map((item) => ({ ...item }))
    : [];
  $: schema = type === 'profiles'
    ? [
        { id: 'name', label: 'Name', multiline: false },
        { id: 'role', label: 'Role', multiline: false },
        { id: 'shortBio', label: 'Short biography', multiline: true },
        { id: 'fullBio', label: 'Full biography', multiline: true },
      ]
    : type === 'highlights'
      ? [
          { id: 'title', label: 'Title', multiline: false },
          { id: 'description', label: 'Description', multiline: true },
        ]
      : fieldId === 'carouselItems'
        ? [
            { id: 'tag', label: 'Tag', multiline: false },
            { id: 'title', label: 'Title', multiline: false },
            { id: 'description', label: 'Description', multiline: true },
          ]
        : [
            { id: 'title', label: 'Title', multiline: false },
            { id: 'subtitle', label: 'Eyebrow', multiline: false },
            { id: 'body', label: 'Body', multiline: true },
            { id: 'linkLabel', label: 'Link label', multiline: false },
            { id: 'linkUrl', label: 'Link URL', multiline: false },
          ];

  function replace(next: Record<string, unknown>[]) {
    onChange(next);
  }

  function addRow() {
    const id = globalThis.crypto?.randomUUID?.().replaceAll('-', '').slice(0, 12) || `${Date.now()}`;
    const next = [...rows, { id: `${type.slice(0, 10)}_${id}` }];
    expandedIndex = next.length - 1;
    replace(next);
  }

  function updateRow(index: number, key: string, nextValue: string) {
    replace(rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: nextValue } : row));
  }

  function removeRow(index: number) {
    replace(rows.filter((_, rowIndex) => rowIndex !== index));
    expandedIndex = Math.max(0, Math.min(expandedIndex, rows.length - 2));
  }

  function moveRow(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    expandedIndex = target;
    replace(next);
  }

  function rowTitle(row: Record<string, unknown>, index: number) {
    return String(row.name || row.title || row.tag || `${label.replace(/s$/, '')} ${index + 1}`);
  }
</script>

<section class="rounded-lg border border-gray-200 bg-gray-50 p-3" on:focusin={onFocus}>
  <div class="flex items-center justify-between gap-3">
    <div><h4 class="text-sm font-medium text-gray-800">{label}</h4><p class="mt-0.5 text-xs text-gray-500">{rows.length} {rows.length === 1 ? 'item' : 'items'} · open one at a time</p></div>
    <button type="button" class="rounded-md border bg-white px-3 py-2 text-xs font-semibold" aria-label={`Add ${label.replace(/s$/, '')}`} disabled={disabled} on:click={addRow}>+ Add</button>
  </div>
  <ol class="mt-3 space-y-2">
    {#each rows as row, index (row.id || index)}
      <li class="rounded-md border border-gray-200 bg-white">
        <div class="flex items-center gap-1 p-2">
          <button type="button" class="min-w-0 flex-1 px-1 py-1 text-left text-sm font-semibold" aria-expanded={expandedIndex === index} on:click={() => expandedIndex = expandedIndex === index ? -1 : index}>{rowTitle(row, index)}</button>
          <button type="button" class="rounded border px-2 py-1 text-xs disabled:opacity-30" aria-label={`Move ${rowTitle(row, index)} up`} disabled={disabled || index === 0} on:click={() => moveRow(index, -1)}>↑</button>
          <button type="button" class="rounded border px-2 py-1 text-xs disabled:opacity-30" aria-label={`Move ${rowTitle(row, index)} down`} disabled={disabled || index === rows.length - 1} on:click={() => moveRow(index, 1)}>↓</button>
          <button type="button" class="rounded border border-red-200 px-2 py-1 text-xs text-red-700 disabled:opacity-30" aria-label={`Remove ${rowTitle(row, index)}`} disabled={disabled} on:click={() => removeRow(index)}>Remove</button>
        </div>
        {#if expandedIndex === index}
          <div class="grid gap-3 border-t border-gray-100 p-3">
            {#each schema as property}
              <label class="block text-xs font-medium text-gray-700">{property.label}
                {#if property.multiline}
                  <textarea class="mt-1 block min-h-20 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={String(row[property.id] || '')} disabled={disabled} on:input={(event) => updateRow(index, property.id, event.currentTarget.value)}></textarea>
                {:else}
                  <input class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={String(row[property.id] || '')} disabled={disabled} on:input={(event) => updateRow(index, property.id, event.currentTarget.value)} />
                {/if}
              </label>
            {/each}
          </div>
        {/if}
      </li>
    {/each}
  </ol>
  {#if rows.length === 0}<p class="mt-3 rounded-md border border-dashed border-gray-300 bg-white p-3 text-center text-xs text-gray-500">No items yet. Add the first one when this section should show content.</p>{/if}
</section>
