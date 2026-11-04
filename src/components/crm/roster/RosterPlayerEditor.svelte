<script lang="ts">
  import { onDestroy } from 'svelte';
  import { tenantIdStore } from '../../../lib/authStore';
  import { backendClient } from '../../../lib/api/backendClient';
  import { BackendApiError, createIdempotencyKey, type RosterPlayerDetails, type RosterPlayerAssignment } from '../../../lib/api/BackendApi';
  import { modalFocus } from '../../../lib/ui/modalFocus';
  import Icon from '../ui/Icon.svelte';

  export let details: RosterPlayerDetails;
  export let teams: any[] = [];
  export let seasons: any[] = [];
  export let onClose: () => void;
  export let onSaved: () => void;
  const tenantId = $tenantIdStore;
  const registrationId = details.registrationId;
  let tab: 'registration' | 'assignments' = 'registration';
  let profile = { ...details.profile };
  let action: 'team' | 'move' | 'add' = 'team';
  let sourceMembershipId = details.seasonMemberships[0]?.id || '';
  let teamId = details.seasonMemberships[0]?.teamId || details.teamIds[0] || '';
  let seasonId = '';
  let assignmentDirty = false;
  let saving = false;
  let message = '';
  let alive = true;
  let operationSignature = '';
  let operationKey = '';
  onDestroy(() => { alive = false; });
  $: if ($tenantIdStore !== tenantId) onClose();
  $: current = details.seasonMemberships.find(m => m.id === sourceMembershipId);
  $: eligibleSeasons = seasons.filter(s => ['active', 'upcoming'].includes(String(s.status || '').toLowerCase()) && !details.seasonMemberships.some(m => m.seasonId === s.id));
  $: destinationSeason = seasons.find(s => s.id === seasonId);
  $: availableTeams = action !== 'team' && destinationSeason?.teamId ? teams.filter(t => t.id === destinationSeason.teamId) : teams;
  function chooseAction(next: typeof action) { action = next; assignmentDirty = true; seasonId = eligibleSeasons[0]?.id || ''; const target = seasons.find(s => s.id === seasonId); if (next !== 'team' && target?.teamId) teamId = target.teamId; }
  function chooseSource() { action = 'team'; assignmentDirty = false; seasonId = ''; const source = details.seasonMemberships.find(m => m.id === sourceMembershipId); teamId = source?.teamId || ''; }
  async function save() {
    if (saving || !tenantId || $tenantIdStore !== tenantId) return;
    if (!profile.name.trim()) { message = 'Enter a player name.'; tab = 'registration'; return; }
    if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) { message = 'Enter a valid email.'; tab = 'registration'; return; }
    const assignment: RosterPlayerAssignment | undefined = assignmentDirty ? { action, teamId: teamId || null, ...(action !== 'team' ? { seasonId } : {}), ...(sourceMembershipId ? { sourceMembershipId } : {}) } : undefined;
    if (assignment && action !== 'team' && !seasonId) { message = 'Choose a destination season.'; return; }
    if (assignment && action === 'move' && !sourceMembershipId) { message = 'Choose a current season.'; return; }
    const profileChanged = JSON.stringify(profile) !== JSON.stringify(details.profile);
    if (!profileChanged && !assignment) { onClose(); return; }
    const changes = { version: details.version, ...(profileChanged ? { profile } : {}), ...(assignment ? { assignment } : {}) };
    const signature = JSON.stringify(changes);
    if (signature !== operationSignature) { operationSignature = signature; operationKey = createIdempotencyKey('roster-player-edit'); }
    saving = true; message = '';
    try {
      const result = await backendClient.editRosterPlayer(tenantId, registrationId, changes, operationKey);
      if (!alive || $tenantIdStore !== tenantId) return;
      if (!result.success || result.tenantId !== tenantId || result.registrationId !== registrationId) throw new Error('Unexpected save response');
      onSaved();
    } catch (error) {
      if (!alive || $tenantIdStore !== tenantId) return;
      message = error instanceof BackendApiError && error.code === 'roster_edit_stale'
        ? 'This player changed. Close and reopen Edit to reload before saving.'
        : error instanceof BackendApiError ? error.message : 'Changes could not be saved. Try again.';
    } finally { if (alive) saving = false; }
  }
  function close() { if (!saving) onClose(); }
</script>

<div class="editor-backdrop" role="presentation" on:click|self={close}>
  <div class="editor" role="dialog" aria-modal="true" aria-labelledby="roster-editor-title" tabindex="-1" use:modalFocus={{ onEscape: close }}>
    <header><h2 id="roster-editor-title">Edit player</h2><button type="button" class="icon-button" aria-label="Close player editor" disabled={saving} on:click={close}><Icon name="close" size={20} /></button></header>
    <div class="editor-tabs" role="group" aria-label="Player editing section"><button type="button" aria-pressed={tab === 'registration'} on:click={() => tab = 'registration'}>Registration</button><button type="button" aria-pressed={tab === 'assignments'} on:click={() => tab = 'assignments'}>Teams & seasons</button></div>
    <form novalidate on:submit|preventDefault={save}>
      <fieldset disabled={saving}>
        <div hidden={tab !== 'registration'} class="registration-fields">
          <div class="field-grid">
            <label class="wide">Player name<input required maxlength="250" bind:value={profile.name} /></label>
            <label>Age group<input maxlength="250" bind:value={profile.ageGroup} placeholder="e.g. 16U" /></label>
            <label>Grade<input maxlength="250" bind:value={profile.grade} /></label>
            <label>Shirt size<input maxlength="250" bind:value={profile.shirtSize} /></label>
            <label>Shorts size<input maxlength="250" bind:value={profile.shortsSize} /></label>
          </div>
          <details><summary>Guardian & contact</summary><div class="field-grid">
            <label class="wide">Guardian name<input maxlength="250" bind:value={profile.guardianName} /></label>
            <label class="wide">Email<input type="email" maxlength="250" bind:value={profile.email} /></label>
            <label class="wide">Phone<input type="tel" maxlength="250" bind:value={profile.phone} /></label>
          </div></details>
        </div>
        <div hidden={tab !== 'assignments'} class="assignment-fields">
          {#if details.seasonMemberships.length}
            <label>Current assignment<select bind:value={sourceMembershipId} on:change={chooseSource}>{#each details.seasonMemberships as m}<option value={m.id}>{teams.find(t => t.id === m.teamId)?.name || 'Unassigned'} · {seasons.find(s => s.id === m.seasonId)?.name || 'Season'}</option>{/each}</select></label>
          {:else}<p class="current-assignment">{teams.filter(t => details.teamIds.includes(t.id)).map(t => t.name).join(', ') || 'Unassigned'}</p>{/if}
          <div class="assignment-actions" role="group" aria-label="Assignment action">{#each [['team', 'Change team'], ['move', 'Move season'], ['add', 'Add season']] as [value, label]}<button type="button" aria-pressed={action === value} disabled={value === 'move' && !details.seasonMemberships.length} on:click={() => chooseAction(value as typeof action)}>{label}</button>{/each}</div>
          {#if action !== 'team'}<label>{action === 'move' ? 'Move to season' : 'Add to season'}<select bind:value={seasonId} on:change={() => { assignmentDirty = true; const season = seasons.find(s => s.id === seasonId); if (season?.teamId) teamId = season.teamId; }}><option value="">Choose season</option>{#each eligibleSeasons as season}<option value={season.id}>{season.name || season.title || 'Unnamed season'}</option>{/each}</select></label>{/if}
          <label>{action === 'team' ? 'Move to team' : 'Team'}<select bind:value={teamId} on:change={() => assignmentDirty = true}><option value="">Unassigned</option>{#each availableTeams as team}<option value={team.id}>{team.name || team.title || 'Unnamed team'}</option>{/each}</select></label>
          {#if action !== 'team' && current}<p class="assignment-impact">{action === 'add' ? 'Keeps' : 'Replaces'} {seasons.find(s => s.id === current.seasonId)?.name || 'current season'}</p>{/if}
        </div>
      </fieldset>
      {#if message}<p class="save-error" role="alert">{message}</p>{/if}
      <footer><button type="button" class="crm-ui-button-secondary" disabled={saving} on:click={close}>Cancel</button><button type="submit" class="crm-ui-button-primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></footer>
    </form>
  </div>
</div>

<style>
  .editor{--roster-line:color-mix(in srgb,var(--crm-brand-primary,#003366) 14%,white);--roster-tint:color-mix(in srgb,var(--crm-brand-primary,#003366) 4%,white)}
  .editor-backdrop{position:fixed;inset:0;z-index:60;display:flex;align-items:flex-end;justify-content:center;background:rgb(8 25 46 / .4);padding-top:env(safe-area-inset-top)}
  .editor{width:100%;max-width:440px;max-height:100%;overflow:auto;border-radius:22px 22px 0 0;background:var(--crm-surface,#fff);color:var(--crm-text,#172033);padding:14px 18px max(18px,env(safe-area-inset-bottom));box-shadow:0 -8px 28px rgb(8 25 46 / .12)}
  header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}h2{font-size:18px;font-weight:700;margin:0}.icon-button{display:grid;place-items:center;min-width:44px;min-height:44px;border:0;background:transparent}
  .editor-tabs,.assignment-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;padding:4px;background:var(--roster-tint);border-radius:10px;margin-bottom:16px}
  .assignment-actions{grid-template-columns:repeat(3,minmax(0,1fr));margin:12px 0}
  .editor-tabs button,.assignment-actions button{min-height:42px;padding:8px 4px;border:0;border-radius:7px;background:transparent;font-size:12px;font-weight:600;color:var(--crm-brand-link)}
  .assignment-actions button{font-size:11px}button[aria-pressed=true]{background:var(--crm-surface,#fff);box-shadow:0 1px 3px rgb(8 25 46 / .08)}
  fieldset{padding:0;border:0;margin:0;min-width:0}.field-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.wide{grid-column:1/-1}
  label{display:grid;gap:5px;font-size:12px;font-weight:600;min-width:0}input,select{width:100%;min-width:0;min-height:44px;border:1px solid var(--roster-line);border-radius:10px;padding:9px 10px;background:var(--roster-tint);color:inherit;font-size:16px;font-weight:400}
  details{border-top:1px solid var(--roster-line);margin-top:14px;padding-top:4px}summary{padding:10px 0;min-height:44px;color:var(--crm-brand-link);font-size:12px}.assignment-fields>label+label{margin-top:12px}
  .current-assignment,.assignment-impact{font-size:12px;color:var(--crm-muted,#596170);margin:8px 0}.assignment-impact{border-top:1px solid var(--roster-line);padding-top:12px}
  footer{display:grid;grid-template-columns:1fr 1.6fr;gap:10px;margin-top:18px}footer button{min-height:44px}.save-error{font-size:13px;color:#9c2c25;margin-top:12px}
  [hidden]{display:none!important}button:disabled{opacity:.5}@media(min-width:768px){.editor-backdrop{align-items:center;padding:24px}.editor{border-radius:18px;max-height:90dvh}}
</style>
