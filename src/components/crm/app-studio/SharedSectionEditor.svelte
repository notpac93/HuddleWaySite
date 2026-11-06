<script lang="ts">
  import type { CrmSectionSource } from '../../../lib/api/BackendApi';
  export let sources: CrmSectionSource[] = [];
  export let busy = false;
  export let componentType = '';
  export let onChange: (source: CrmSectionSource, key: string, value: string) => void;
  const labels: Record<string, string> = { name: 'Team name', heroTitle: 'Team main title', heroSubtitle: 'Team bottom line', coachName: 'Head coach name', coachRole: 'Head coach role', title: 'Event title', location: 'Event location', description: 'Event description' };
  const limits: Record<string, number> = { name: 40, heroTitle: 60, heroSubtitle: 120, coachName: 160, coachRole: 120, title: 160, location: 500, description: 4000 };
</script>

{#each sources as source (`${source.kind}:${source.id}`)}
  <details class="shared-source">
    <summary>Edit {source.kind === 'team' ? 'team & coach information' : 'event information'} · {source.label}</summary>
    <div class="source-fields">
      <p class="impact" role="note">{source.recurring ? 'This is a recurring event. Changes update the whole recurring event and all connected schedules and pages.' : 'This is shared information. Changes update the owner’s records and every connected appearance automatically.'}</p>
      {#each Object.entries(source.values).filter(([key]) => source.kind === 'event' || (componentType === 'hero_section' ? key === 'name' : ['coachName', 'coachRole'].includes(key))) as [key, value] (key)}
        <div class="source-field"><label for={`source-${source.kind}-${source.id}-${key}`}>{labels[key] || key}</label>
          {#if key === 'description'}
            <textarea id={`source-${source.kind}-${source.id}-${key}`} {value} maxlength={limits[key]} disabled={busy} on:input={(event) => onChange(source, key, event.currentTarget.value)}></textarea>
          {:else}
            <input id={`source-${source.kind}-${source.id}-${key}`} type="text" {value} maxlength={limits[key]} required={key === 'name' || key === 'title'} disabled={busy} on:input={(event) => onChange(source, key, event.currentTarget.value)} />
          {/if}
          <span>{value.length} / {limits[key]} characters</span>
        </div>
      {/each}
    </div>
  </details>
{/each}

<style>
  .shared-source { margin: 12px; border: 1px solid var(--crm-border, #dce2eb); border-radius: 10px; background: var(--crm-surface, white); }
  summary { padding: 14px; cursor: pointer; font-weight: 600; font-size: 14px; }
  .source-fields { padding: 0 14px 14px; display: grid; gap: 14px; }
  .impact { padding: 12px; border-radius: 8px; background: var(--crm-brand-surface); font-size: 13px; }
  .source-field { display: grid; gap: 6px; font-size: 14px; }
  label { font-weight: 600; }
  input, textarea { width: 100%; min-width: 0; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 16px; font-weight: 400; }
  span { font-size: 12px; font-weight: 400; color: #64748b; }
</style>
