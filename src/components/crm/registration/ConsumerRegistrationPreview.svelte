<script lang="ts">
  import { registrationPresentationGroups } from '../../../lib/registration/guidedFormBuilder';
  import type { RegistrationFormSection } from '../../../lib/registration/registrationFormBuilder';
  import RegistrationFormFields from './RegistrationFormFields.svelte';
  export let sections: RegistrationFormSection[];
  export let title: string;
  export let description = '';
  export let event: { title: string; date: string; price: string; imageUrl?: string } | null = null;
  let active = 'participant';
  let complete = false;
  let answers: Record<string, string> = {};
  $: groups = registrationPresentationGroups(sections);
  $: stepIds = [...groups.map(group => group.id), 'review'];
  $: if (!stepIds.includes(active)) active = stepIds[0];
  function jump(id: string) { active = id; complete = false; }
  function advance() {
    const index = stepIds.indexOf(active);
    if (index < stepIds.length - 1) jump(stepIds[index + 1]);
    else complete = true;
  }
</script>
<section class="consumer-registration" aria-label="Consumer registration form preview">
  <header class="consumer-header"><h3>Registration</h3></header>
  <div class="consumer-canvas">
    {#if event}
      <div class="event-card">
        {#if event.imageUrl}<img src={event.imageUrl} alt="" />{:else}<div class="event-initial" aria-hidden="true">{event.title.slice(0, 1)}</div>{/if}
        <div><h4>{event.title}</h4>{#if event.date}<p>{event.date}</p>{/if}<strong>{event.price}</strong></div>
      </div>
    {:else}<h4 class="form-title">{title}</h4>{/if}
    <nav class="consumer-progress" aria-label="Consumer registration sections">{#each groups as group}<button type="button" aria-current={active === group.id ? 'step' : undefined} on:click={() => jump(group.id)}>{group.title}</button>{/each}<button type="button" aria-current={active === 'review' ? 'step' : undefined} on:click={() => jump('review')}>Review</button></nav>
    {#if description}<p class="description">{description}</p>{/if}
    {#each groups as group}
      <section hidden={active !== group.id} class="consumer-group" data-consumer-group={group.id} aria-label={group.title}>
        <h4>{group.title}</h4>
        {#each group.sections as section}
          <section class="consumer-source" aria-label={section.title}>
            {#if group.sections.length > 1}<h5>{section.title}</h5>{/if}
            <RegistrationFormFields {section} appearance="consumer" bind:values={answers} />
          </section>
        {/each}
      </section>
    {/each}
    {#if active === 'review'}
      <section class="consumer-review" aria-label="Registration review">
        <h4>Review</h4>
        {#each groups as group}
          <div class="review-group"><h5>{group.title}</h5><dl>{#each group.sections as section}{#each section.fields as field}<div><dt>{field.label}</dt><dd>{answers[field.id] || '—'}</dd></div>{/each}{/each}</dl></div>
        {/each}
      </section>
    {/if}
    <div class="consumer-step-actions">
      {#if stepIds.indexOf(active) > 0}<button type="button" class="consumer-back" on:click={() => jump(stepIds[stepIds.indexOf(active) - 1])}>Previous step</button>{/if}
      <button type="button" class="consumer-continue" on:click={advance}>{active === 'review' ? 'Finish preview' : 'Continue'}</button>
    </div>
    {#if complete}<p role="status">Preview only. No registration submitted.</p>{/if}
  </div>
</section>
<style>
  .consumer-registration{--registration-preview-accent:#3296df;background:#1c3156;border-radius:16px;overflow:hidden;border:1px solid #d5dbe5}
  .consumer-header{background:white;text-align:center;padding:18px 14px}.consumer-header h3{font-size:20px;font-weight:600;margin:0;color:#182235}
  .consumer-canvas{margin:12px;padding:18px 14px;background:#eff1fb;border:1px solid #52b9bd;border-radius:16px;color:#182235}
  .event-card{display:flex;align-items:center;gap:12px;padding:12px;background:white;border:1px solid #c9ced8;border-radius:16px;margin-bottom:18px}.event-card img,.event-initial{width:64px;height:72px;object-fit:cover;border-radius:10px;flex-shrink:0}.event-initial{display:grid;place-items:center;background:#e2eaf6;color:#1c3156;font-size:24px;font-weight:600}.event-card>div{min-width:0}.event-card h4{font-size:16px;font-weight:600;margin:0;overflow-wrap:anywhere}.event-card p{font-size:12px;color:#51617a;margin:5px 0}.event-card strong{font-size:16px;color:#3296df}.form-title{font-size:18px;font-weight:600;margin:0 0 18px;overflow-wrap:anywhere}
  .consumer-progress{display:flex;gap:7px;margin-bottom:24px}.consumer-progress button{flex:1;min-width:0;border:0;border-top:4px solid #c5c9d3;padding:9px 0 0;background:none;color:#596375;font:inherit;font-size:11px;text-align:left;min-height:44px;overflow-wrap:anywhere}.consumer-progress [aria-current=step]{border-color:#3296df;color:#217bc1;font-weight:600}
  .consumer-group{margin-bottom:24px}.consumer-group>h4{font-size:16px;font-weight:600;margin:0 0 16px}.consumer-source{margin-bottom:18px}.consumer-source h5{font-size:14px;font-weight:500;margin:0 0 12px}.description{font-size:14px;color:#51617a;margin-bottom:20px}
  .consumer-continue{width:100%;min-height:46px;border:0;border-radius:10px;background:#3296df;color:#071b2c;font:inherit;font-size:16px;font-weight:600;padding:10px}.consumer-canvas [role=status]{font-size:12px;color:#51617a;margin:12px 0 0}
  .consumer-group[hidden]{display:none}
  .consumer-step-actions{display:flex;gap:10px}.consumer-back{flex-shrink:0;min-height:46px;padding:10px 12px;border:1px solid #c9ced8;border-radius:10px;background:white;font:inherit;font-size:14px;color:#182235}
  .consumer-review>h4{font-size:16px;font-weight:600;margin:0 0 16px}.review-group{margin:0 0 20px}.review-group h5{font-size:14px;font-weight:600;margin:0 0 8px}.review-group dl{margin:0}.review-group dl>div{display:flex;justify-content:space-between;gap:14px;padding:8px 0;border-bottom:1px solid #d0d5df;font-size:14px}.review-group dt{color:#51617a}.review-group dd{margin:0;overflow-wrap:anywhere;text-align:right;min-width:0}
</style>
