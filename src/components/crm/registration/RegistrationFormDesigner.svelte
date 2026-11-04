<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';
  import { modalFocus } from '../../../lib/ui/modalFocus';
  import { nextBuilderId, validateRegistrationSections, type RegistrationFormField, type RegistrationFormSection, type RegistrationFieldType } from '../../../lib/registration/registrationFormBuilder';
  import { registrationPresets, contactSection, contactCount, baseContactFields, withContactCount, question, registrationPresentationGroups, presetPresentationGroup } from '../../../lib/registration/guidedFormBuilder';
  import RegistrationFormFields from './RegistrationFormFields.svelte';
  import ConsumerRegistrationPreview from './ConsumerRegistrationPreview.svelte';
  export let sections: RegistrationFormSection[];
  export let title: string;
  export let description = '';
  export let ageGroups: string[] = [];
  export let historyError = '';
  export let step = 1;
  export let disabled = false;
  export let previewEvent: { title: string; date: string; price: string; imageUrl?: string } | null = null;
  let editingSectionId = '';
  const categories = [{ id: 'participant', title: 'Participant questions' }, { id: 'contact', title: 'Contacts' }, { id: 'details', title: 'Details' }];
  let sectionIndex = 0;
  let message = '';
  let panel: 'section' | 'question' | null = null;
  let sheet: HTMLDivElement;
  let draftSection: RegistrationFormSection;
  let draftFields: { field: RegistrationFormField; included: boolean }[] = [];
  let draftCount = 1;
  let draftField: RegistrationFormField;
  let fieldIndex = -1;
  let optionsText = '';
  let panelError = '';
  let directField = false;
  const dispatch = createEventDispatcher();
  $: presets = registrationPresets(ageGroups);
  $: cards = [...presets, ...sections.filter(s => !presets.some(p => p.id === s.id))];
  $: groups = registrationPresentationGroups(sections);
  $: currentGroup = groups[Math.min(sectionIndex, groups.length - 1)];
  $: if (sectionIndex >= groups.length) sectionIndex = Math.max(0, groups.length - 1);

  function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
  function next() {
    message = '';
    if (!title.trim()) { message = 'Enter a form name.'; return; }
    const issue = validateRegistrationSections(sections);
    if (issue) { message = issue; return; }
    if (step === 1) { step = 2; sectionIndex = 0; }
    else if (step === 2 && sectionIndex < groups.length - 1) sectionIndex++;
    else step = 3;
  }
  function back() {
    message = '';
    if (step === 3) { step = 2; sectionIndex = groups.length - 1; }
    else if (step === 2 && sectionIndex > 0) sectionIndex--;
    else if (step === 2) step = 1;
    else dispatch('cancel');
  }
  function openSection(candidate: RegistrationFormSection) {
    editingSectionId = candidate.id;
    const existing = sections.find(s => s.id === candidate.id);
    draftSection = copy(existing || { ...candidate, fields: [] });
    draftCount = contactCount(draftSection);
    const base = contactSection(draftSection) ? baseContactFields(draftSection) : draftSection.fields;
    const preset = presets.find(s => s.id === candidate.id);
    const usedElsewhere = new Set(sections.filter(s => s.id !== candidate.id).flatMap(s => s.fields.map(f => f.id)));
    const options = [...base, ...(preset?.fields || []).filter(f => !base.some(b => b.id === f.id) && !usedElsewhere.has(f.id))];
    draftFields = options.map(f => ({ field: copy(f), included: existing ? base.some(b => b.id === f.id) : (candidate.id !== 'additional_questions' && (candidate.id === 'player_information' || options.indexOf(f) === 0)) }));
    directField = false; panelError = ''; panel = 'section';
  }
  function closePanel() { panel = null; panelError = ''; }
  function newField() {
    const scope = [...sections, { ...draftSection, fields: draftFields.map(f => f.field) }];
    draftFields = [...draftFields, { field: question(nextBuilderId('field', scope), ''), included: true }];
  }
  function sectionToSave() {
    let result = { ...draftSection, fields: draftFields.filter(f => f.included).map(f => f.field) };
    if (contactSection(result)) {
      // Reuse saved repetitions so reopening a form never destroys their answers' labels.
      const old = sections.find(s => s.id === result.id);
      result = withContactCount({ ...result, fields: [...result.fields, ...(old?.fields.filter(f => /^contact[2-4]_/.test(f.id)) || [])] }, draftCount);
    }
    return result;
  }
  function commitSection() {
    const result = sectionToSave();
    if (!result.title.trim()) { panelError = 'Enter a section name.'; return; }
    const nextSections = sections.some(s => s.id === result.id) ? sections.map(s => s.id === result.id ? result : s) : [...sections, result];
    const issue = validateRegistrationSections(nextSections);
    if (issue) { panelError = issue; return; }
    sections = nextSections; closePanel();
  }
  function removeSection() {
    if (draftSection.fields.some(f => f.id === 'player_name') || draftSection.id === 'player_information') return;
    sections = sections.filter(s => s.id !== draftSection.id); closePanel();
  }
  function openQuestion(index: number, direct = false) {
    fieldIndex = index; draftField = copy(draftFields[index].field);
    optionsText = (draftField.options || []).join('\n'); directField = direct; panelError = ''; panel = 'question';
    void tick().then(() => sheet?.querySelector<HTMLInputElement>('input:not([disabled])')?.focus());
  }
  function changeField(field: RegistrationFormField, source: RegistrationFormSection) {
    openSection(sections.find(s => s.id === source.id)!); const index = draftFields.findIndex(f => f.field.id === field.id);
    // Repeated contacts keep individual settings editable without changing their siblings.
    if (index < 0) {
      draftFields.push({ field: copy(field), included: true });
      openQuestion(draftFields.length - 1, true);
    } else openQuestion(index, true);
  }
  function saveQuestion() {
    draftField.label = draftField.label.trim();
    draftField.options = draftField.type === 'dropdown' ? optionsText.split('\n').map(v => v.trim()).filter(Boolean) : null;
    if (!draftField.label) { panelError = 'Enter a question.'; return; }
    if (draftField.type === 'dropdown' && ((draftField.options || []).length < 2 || new Set((draftField.options || []).map(v => v.toLowerCase())).size !== draftField.options!.length)) { panelError = 'Add at least two different choices.'; return; }
    if (draftField.id === 'player_name' && (!draftField.required || draftField.type !== 'text')) {
      panelError = 'Player name must be a required text field for roster records.';
      return;
    }
    if (directField) {
      const owner = sections.find(s => s.id === editingSectionId)!;
      const updated = { ...owner, fields: owner.fields.map(f => f.id === draftField.id ? draftField : f) };
      const nextSections = sections.map(s => s.id === owner.id ? updated : s);
      const issue = validateRegistrationSections(nextSections);
      if (issue) { panelError = issue; return; }
      sections = nextSections; closePanel();
    } else {
      draftFields = draftFields.map((f, i) => i === fieldIndex ? { ...f, field: copy(draftField) } : f);
      panel = 'section'; panelError = '';
    }
  }
  function removeQuestion() {
    if (draftField.id === 'player_name') return;
    if (directField) {
      const nextSections = sections.map(s => s.id === editingSectionId ? { ...s, fields: s.fields.filter(f => f.id !== draftField.id) } : s);
      const issue = validateRegistrationSections(nextSections);
      if (issue) { panelError = issue; return; }
      sections = nextSections; closePanel();
    } else { draftFields = draftFields.filter((_, i) => i !== fieldIndex); panel = 'section'; }
  }
  function addHistory(value: string) {
    const options = optionsText.split('\n').map(v => v.trim()).filter(Boolean);
    optionsText = options.includes(value) ? options.filter(v => v !== value).join('\n') : [...options, value].join('\n');
  }
</script>

<div class="guided-form-builder">
  <div inert={panel !== null}>
    <div class="builder-steps" aria-label="Registration form steps">{#each ['Choose', 'Customize', 'Preview'] as label, i}<span aria-current={step === i + 1 ? 'step' : undefined}>{label}</span>{/each}</div>
    {#if step === 1}
      <h3>What do you need?</h3>
      <label class="builder-label">Form name<input bind:value={title} maxlength="120" /></label>
      {#each categories as category}
        <section class="builder-category" aria-label={category.title}>
          <h4>{category.title}</h4>
          <div class="section-cards">{#each cards.filter(card => (registrationPresentationGroups([card])[0]?.id || presetPresentationGroup(card.id)) === category.id) as card (card.id)}<button type="button" class:selected={sections.some(s => s.id === card.id)} aria-pressed={sections.some(s => s.id === card.id)} aria-haspopup="dialog" on:click={() => openSection(card)}><span>{card.title}</span><span aria-hidden="true">{sections.some(s => s.id === card.id) ? '✓' : '+'}</span></button>{/each}</div>
        </section>
      {/each}
    {:else if step === 2 && currentGroup}
      <nav class="customize-groups" aria-label="Question groups">{#each groups as group, i}<button type="button" aria-current={sectionIndex === i ? 'step' : undefined} on:click={() => sectionIndex = i}>{group.builderTitle}</button>{/each}</nav>
      <div class="customize-canvas">
        {#each currentGroup.sections as source (source.id)}
          <div class="section-heading"><button type="button" on:click={() => openSection(sections.find(s => s.id === source.id)!)} aria-haspopup="dialog">{source.title}</button></div>
          <RegistrationFormFields section={source} editable appearance="consumer" on:edit={e => changeField(e.detail, source)} />
        {/each}
      </div>
    {:else if step === 3}
      <ConsumerRegistrationPreview {sections} {title} {description} event={previewEvent} />
    {/if}
    {#if message}<p class="builder-error" role="alert">{message}</p>{/if}
    <div class="builder-footer">
      <button type="button" class="crm-ui-button-secondary" on:click={back}>{step === 1 ? 'Cancel' : 'Back'}</button>
      {#if step === 3}<slot name="save" />{:else}<button type="button" class="crm-ui-button-primary" on:click={next}>{step === 1 ? 'Customize' : sectionIndex < groups.length - 1 ? `Next: ${groups[sectionIndex + 1].builderTitle}` : 'Preview'}</button>{/if}
    </div>
  </div>

  {#if panel}
    <div class="settings-overlay" role="presentation" on:click={e => { if (e.target === e.currentTarget) closePanel(); }}>
      <div bind:this={sheet} class="settings-sheet" role="dialog" aria-modal="true" aria-label={panel === 'section' ? `${draftSection.title} settings` : 'Question settings'} tabindex="-1" use:modalFocus={{ onEscape: closePanel }}>
        <fieldset disabled={disabled}>
          <div class="sheet-heading"><h3>{panel === 'section' ? draftSection.title : draftField.label || 'Add question'}</h3><button type="button" aria-label="Close settings" on:click={closePanel}>×</button></div>
          {#if panel === 'section'}
            <label class="builder-label">Section name<input bind:value={draftSection.title} maxlength="120" /></label>
            {#if contactSection(draftSection)}<div class="contact-count"><span>{draftSection.id === 'guardian_information' ? 'Guardians' : 'Emergency contacts'}</span><div><button type="button" aria-label="Fewer contacts" disabled={draftCount <= 1} on:click={() => draftCount--}>−</button><output aria-live="polite">{draftCount}</output><button type="button" aria-label="More contacts" disabled={draftCount >= 4} on:click={() => draftCount++}>+</button></div></div>{/if}
            {#each draftFields as entry, i (entry.field.id)}
              <div class="option-row"><label><input type="checkbox" bind:checked={entry.included} disabled={entry.field.id === 'player_name'} /><span>{entry.field.label || 'New field'}</span></label><button type="button" aria-label={`Configure ${entry.field.label || 'new field'}`} on:click={() => openQuestion(i)}>⋯</button></div>
            {/each}
            <button type="button" class="add-field" on:click={() => { newField(); openQuestion(draftFields.length - 1); }}>+ Add</button>
            <div class="builder-footer"><button type="button" class="crm-ui-button-secondary" on:click={removeSection} disabled={draftSection.id === 'player_information' || draftSection.fields.some(f => f.id === 'player_name')}>Remove</button><button type="button" class="crm-ui-button-primary" on:click={commitSection}>Done</button></div>
          {:else}
            <label class="builder-label">Question<input bind:value={draftField.label} maxlength="120" /></label>
            <label class="builder-label">Answer type<select aria-label="Answer type" bind:value={draftField.type} on:change={() => panelError = ''}>{#each [['text','Text'],['date','Date'],['email','Email'],['phone','Phone'],['dropdown','Choices'],['yes_no','Yes / No']] as [value, label]}<option {value}>{label}</option>{/each}</select></label>
            {#if draftField.type === 'dropdown'}
              {#if draftField.id === 'age_group'}
                <div class="history-title">Previously used</div>
                {#if historyError}<p role="status">{historyError}</p>{/if}
                <div class="age-history">{#each ageGroups as age}<button type="button" aria-pressed={optionsText.split('\n').includes(age)} on:click={() => addHistory(age)}>{age}</button>{/each}</div>
                {#if !ageGroups.length && !historyError}<p class="empty-history">No saved age groups yet.</p>{/if}
              {/if}
              <label class="builder-label">Choices — one per line<textarea bind:value={optionsText} rows="4" maxlength="5000"></textarea></label>
            {/if}
            <label class="required-choice"><input type="checkbox" bind:checked={draftField.required} on:change={() => panelError = ''} />Required</label>
            <div class="builder-footer"><button type="button" class="crm-ui-button-secondary" disabled={draftField.id === 'player_name'} on:click={removeQuestion}>Remove</button><button type="button" class="crm-ui-button-primary" on:click={saveQuestion}>Done</button></div>
          {/if}
          {#if panelError}<p class="builder-error" role="alert">{panelError}</p>{/if}
        </fieldset>
      </div>
    </div>
  {/if}
</div>

<style>
  .guided-form-builder{font:16px/1.4 var(--portal-font-ui,Arial,sans-serif);color:#182235;min-width:0}
  .builder-steps{display:flex;gap:8px;margin-bottom:16px}.builder-steps span{flex:1;border-bottom:2px solid #dce3ed;color:#607087;font-size:12px;padding-bottom:8px}.builder-steps [aria-current=step]{border-color:var(--crm-brand-link,#2453cf);color:var(--crm-brand-link,#2453cf)}
  h3{font-size:24px;line-height:1.2;font-weight:600;margin:0 0 20px}h4{font-size:16px;font-weight:500;margin:0 0 10px}
  .builder-label{display:grid;gap:6px;font-size:14px;font-weight:500;margin:14px 0}input:not([type=checkbox]),select,textarea{width:100%;min-width:0;min-height:46px;border:1px solid #d1d5db;background:white;color:#182235;border-radius:.6rem;padding:10px 12px;font:inherit;font-size:16px;font-weight:400}input[type=checkbox]{width:18px;height:18px;accent-color:var(--crm-brand-control,#003366);flex-shrink:0}
  button{font-family:inherit}button:disabled{opacity:.5}.section-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:20px 0}.section-cards button{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;text-align:left;border:1px solid #dce3ed;border-radius:12px;background:white;padding:14px 12px;min-height:76px;font-size:16px}.section-cards button.selected{background:var(--crm-brand-surface,#eaf2fc);border-color:var(--crm-brand-link,#2453cf)}.section-cards span{overflow-wrap:anywhere}
  .builder-footer{display:grid;grid-template-columns:1fr 1.8fr;gap:10px;border-top:1px solid #dce3ed;margin-top:20px;padding-top:16px}
  .section-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px}.section-heading button{background:none;border:0;border-bottom:1px dotted var(--crm-brand-link,#2453cf);padding:4px 0;min-height:36px;font-size:16px;font-weight:500}
  .builder-error{color:#b42318;font-size:14px;margin-top:12px}
  .settings-overlay{position:fixed;inset:0;z-index:70;display:flex;align-items:flex-end;justify-content:center;background:#15243a66;padding:0 8px}.settings-sheet{background:white;border-radius:20px 20px 0 0;padding:16px 18px 24px;width:100%;max-width:480px;max-height:90dvh;overflow-y:auto;animation:sheet-in .18s ease-out}.settings-sheet fieldset{border:0;padding:0;margin:0;min-width:0}.sheet-heading{display:flex;align-items:center;gap:8px;justify-content:space-between}.sheet-heading h3{font-size:20px;margin:0;overflow-wrap:anywhere}.sheet-heading button{border:0;background:none;font-size:26px;min-width:44px;min-height:44px;color:#607087}
  .option-row{display:flex;align-items:center;gap:8px;border-bottom:1px solid #dce3ed}.option-row label{display:flex;align-items:center;gap:10px;min-height:48px;flex:1;min-width:0}.option-row span{overflow-wrap:anywhere}.option-row button{min-height:44px;min-width:44px;border:0;background:none;color:var(--crm-brand-link,#2453cf);font-size:22px}
  .contact-count,.contact-count>div{display:flex;align-items:center;justify-content:space-between;gap:12px}.contact-count{margin:16px 0;font-size:14px}.contact-count button{width:44px;height:44px;border:1px solid #dce3ed;border-radius:10px;background:#f4f6f9}.contact-count output{font-size:16px;min-width:20px;text-align:center}.add-field{border:0;background:none;color:var(--crm-brand-link,#2453cf);min-height:44px;padding:8px 0}.required-choice{display:flex;align-items:center;gap:10px;min-height:44px;font-size:14px}.history-title{font-size:14px;margin-top:14px}.age-history{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}.age-history button{border:1px solid #dce3ed;border-radius:10px;background:white;min-height:44px;padding:8px 12px}.age-history [aria-pressed=true]{background:var(--crm-brand-surface,#eaf2fc);border-color:var(--crm-brand-link,#2453cf)}.empty-history{font-size:14px;color:#607087}
  @keyframes sheet-in{from{transform:translateY(14px)}to{transform:translateY(0)}}@media(prefers-reduced-motion:reduce){.settings-sheet{animation:none}}
  .builder-category{margin-top:20px}.builder-category h4{font-size:14px;font-weight:500;margin:0 0 8px}.builder-category .section-cards{margin:0}
  .customize-groups{display:flex;gap:8px;margin:4px 0 16px}.customize-groups button{flex:1;min-width:0;min-height:48px;border:0;border-bottom:3px solid #d0d5df;background:none;font-size:12px;text-align:left;padding:6px 0;color:#607087}.customize-groups [aria-current=step]{border-color:var(--crm-brand-border);color:var(--crm-brand-link);font-weight:500}
  .customize-canvas{padding:16px;background:var(--crm-brand-surface);border:1px solid #dce3ed;border-radius:14px}.customize-canvas .section-heading:not(:first-child){margin-top:22px}
</style>
