<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { tenantIdStore } from '../../../lib/authStore';
  import { backendClient } from '../../../lib/api/backendClient';
  import type { RosterPlayerDetails } from '../../../lib/api/BackendApi';
  import { modalFocus } from '../../../lib/ui/modalFocus';
  import Icon from '../ui/Icon.svelte';
  import RosterPlayerEditor from './RosterPlayerEditor.svelte';
  export let players: any[] = [];
  export let teams: any[] = [];
  export let seasons: any[] = [];
  export let loading = false;
  export let error = '';
  export let truncated = false;
  export let activeResultId: string | null = null;
  export let onTargetConsumed: (id: string) => void = () => {};
  export let onAddPlayer: () => void = () => {};
  export let onImportPlayers: () => void = () => {};
  let query = '', teamFilter = '', sort = 'name';
  let openId = '', editingId = '', loadingId = '', detailsError = '';
  let filtersOpen = false, toolsOpen = false;
  let cache: Record<string, RosterPlayerDetails> = {};
  let scopeTenant = $tenantIdStore;
  let generation = 0;
  let consumedResultId: string | null = null;
  const dispatch = createEventDispatcher();
  onDestroy(() => { generation += 1; });
  $: if ($tenantIdStore !== scopeTenant) { generation += 1; scopeTenant = $tenantIdStore; cache = {}; openId = ''; editingId = ''; loadingId = ''; query = ''; teamFilter = ''; detailsError = ''; consumedResultId = null; filtersOpen = false; toolsOpen = false; }
  $: rows = players.map(p => ({ ...p, profile: cache[p.id]?.profile || p.profile, name: cache[p.id]?.profile.name || p.profile?.name || p.name }));
  $: filtered = rows.filter(p => [p.name, p.profile?.guardianName].filter(Boolean).join(' ').toLowerCase().includes(query.toLowerCase()) && (!teamFilter || p.teamIds?.includes(teamFilter) || p.teamId === teamFilter)).sort((a,b) => sort === 'age' ? (a.profile?.ageGroup || '').localeCompare(b.profile?.ageGroup || '', undefined, { numeric: true }) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name));
  $: if (activeResultId && activeResultId !== consumedResultId && players.some(p => p.id === activeResultId)) { consumedResultId = activeResultId; query = ''; teamFilter = ''; void expand(activeResultId); onTargetConsumed(activeResultId); }
  function money(value: number | null, currency: string) { if (value == null) return '—'; try { return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value / 100); } catch { return '—'; } }
  async function expand(id: string, force = false) {
    if (openId === id && !force) { openId = ''; generation += 1; loadingId = ''; return; }
    openId = id; detailsError = ''; const tenantId = $tenantIdStore; const request = ++generation;
    if (!tenantId || (cache[id] && !force)) { loadingId = ''; return; }
    loadingId = id;
    try {
      const result = await backendClient.rosterPlayerDetails(tenantId, id);
      if (request !== generation || $tenantIdStore !== tenantId) return;
      if (result.tenantId !== tenantId || result.registrationId !== id) throw new Error('Roster scope mismatch');
      cache = { ...cache, [id]: result };
    } catch { if (request === generation && $tenantIdStore === tenantId) detailsError = 'Player details could not be loaded.'; }
    finally { if (request === generation) loadingId = ''; }
  }
  function saved() { const id = editingId; editingId = ''; const next = { ...cache }; delete next[id]; cache = next; void expand(id, true); dispatch('changed'); }
  function download() {
    const quote = (v: unknown) => `"${String(v ?? '').replaceAll('"','""').replace(/^\s*[=+@-]/, "'$&")}"`;
    const csv = [['Name','Age group','Grade','Team'], ...filtered.map(p=>[p.name,p.profile?.ageGroup,p.profile?.grade,p.team])].map(row=>row.map(quote).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8;' })); const link = document.createElement('a'); link.href = url; link.download = 'roster.csv'; link.click(); URL.revokeObjectURL(url); toolsOpen = false;
  }
</script>

<section class="compact-roster" aria-label="Player roster">
  <div class="roster-controls"><label class="search"><Icon name="search" size={20} /><input type="search" bind:value={query} placeholder="Search players" aria-label="Search players or guardians" /></label><button class="icon-button" type="button" aria-label="Filter and sort players" aria-pressed={Boolean(teamFilter || sort !== 'name')} on:click={() => filtersOpen = true}><Icon name="filter" size={20} /></button><button class="icon-button tools" type="button" aria-label="Roster tools" on:click={() => toolsOpen = true}>•••</button></div>
  {#if teamFilter || sort !== 'name'}<div class="active-filter"><span>{teams.find(t => t.id === teamFilter)?.name || (sort === 'age' ? 'Age group' : '')}</span><button type="button" on:click={() => { teamFilter = ''; sort = 'name'; }}>Clear</button></div>{/if}
  {#if loading}<p role="status">Loading roster…</p>{:else if error}<p role="alert">{error}</p>{:else}
    <div class="player-list">
      {#each filtered as p (p.id)}
        <article class="player-entry"><div class="player-row"><button type="button" class="player-toggle" aria-expanded={openId === p.id} aria-controls={`roster-payment-${p.id}`} on:click={() => expand(p.id)}><span class="avatar">{p.name.split(/\s+/).map((n: string) => n[0]).slice(0,2).join('')}</span><span class="identity"><strong>{p.name}</strong><span class="metadata">{[p.profile?.ageGroup,p.profile?.grade ? `${p.profile.grade} grade` : '',p.team !== 'Unassigned' ? p.team : ''].filter(Boolean).join(' · ') || p.role}</span></span><span class:expanded={openId === p.id}><Icon name="chevronDown" size={16} /></span></button>{#if openId === p.id}<button type="button" class="edit" aria-label={`Edit ${p.name}`} disabled={!cache[p.id] || loadingId === p.id} on:click={() => editingId = p.id}>Edit</button>{/if}</div>
          <section class="payment" id={`roster-payment-${p.id}`} aria-label={`Registration totals for ${p.name}`} hidden={openId !== p.id}>
            {#if loadingId === p.id}<p role="status">Loading…</p>{:else if detailsError && openId === p.id}<p role="alert">{detailsError} <button type="button" on:click={() => expand(p.id,true)}>Retry</button></p>{:else if cache[p.id]}<dl>{#each [['Total','totalCents'],['Paid','paidCents'],['Remaining','remainingCents']] as [label,key]}<div><dt>{label}</dt><dd class:remaining={key === 'remainingCents'}>{money(cache[p.id].billing[key as 'totalCents' | 'paidCents' | 'remainingCents'],cache[p.id].billing.currency)}</dd></div>{/each}</dl>{/if}
          </section>
        </article>
      {:else}<p class="empty">{query || teamFilter ? 'No matching players.' : 'No players yet.'}</p>{/each}
    </div>
    {#if truncated}<p class="scope-note" role="status">This roster is incomplete. Narrow the team scope to see more players.</p>{/if}
  {/if}
</section>
{#if editingId && cache[editingId]}<RosterPlayerEditor details={cache[editingId]} {teams} {seasons} onClose={() => editingId = ''} onSaved={saved} />{/if}
{#if filtersOpen || toolsOpen}
  <div class="options-backdrop" role="presentation" on:click|self={() => { filtersOpen = false; toolsOpen = false; }}><div class="options" role="dialog" aria-modal="true" aria-label={filtersOpen ? 'Filter and sort' : 'Roster tools'} tabindex="-1" use:modalFocus={{ onEscape: () => { filtersOpen = false; toolsOpen = false; } }}><header><h3>{filtersOpen ? 'Filter & sort' : 'Roster tools'}</h3><button type="button" class="icon-button" aria-label="Close roster options" on:click={() => { filtersOpen = false; toolsOpen = false; }}><Icon name="close" size={20} /></button></header>
  {#if filtersOpen}<label>Team<select bind:value={teamFilter}><option value="">All teams</option>{#each teams as team}<option value={team.id}>{team.name || team.title}</option>{/each}</select></label><label>Sort<select bind:value={sort}><option value="name">Name A–Z</option><option value="age">Age group</option></select></label><button type="button" class="crm-ui-button-primary" on:click={() => filtersOpen = false}>Done</button>{:else}<button class="tool" type="button" on:click={() => { toolsOpen = false; onAddPlayer(); }}>Add player</button><button class="tool" type="button" on:click={() => { toolsOpen = false; onImportPlayers(); }}>Import CSV</button><button class="tool" type="button" on:click={download}>Export roster</button>{/if}
  </div></div>
{/if}
<style>
  .compact-roster,.options{--roster-line:color-mix(in srgb,var(--crm-brand-primary,#003366) 14%,white);--roster-tint:color-mix(in srgb,var(--crm-brand-primary,#003366) 4%,white)}
  .compact-roster{color:var(--crm-text,#172033)}.roster-controls{display:flex;gap:8px;margin-bottom:14px}.search{display:flex;align-items:center;gap:8px;min-width:0;flex:1;border:1px solid var(--roster-line);border-radius:10px;padding:0 12px;background:var(--crm-surface,#fff);color:var(--crm-muted,#596170)}.search input{border:0;background:transparent;min-width:0;width:100%;min-height:46px;outline:0;font-size:16px;color:var(--crm-text,#172033)}.search:focus-within{outline:2px solid var(--crm-brand-focus)}.icon-button{min-width:44px;min-height:44px;border:1px solid var(--roster-line);border-radius:10px;display:grid;place-items:center;background:var(--crm-surface,#fff);color:var(--crm-brand-link)}.tools{min-width:30px;border:0;background:transparent}.active-filter{display:flex;justify-content:space-between;font-size:12px;margin-bottom:10px}.active-filter button{color:var(--crm-brand-link);min-height:36px}
  .player-list{background:var(--crm-surface,#fff);border:1px solid var(--roster-line);border-radius:16px;overflow:hidden}.player-entry+.player-entry{border-top:1px solid var(--roster-line)}.player-row{display:flex;align-items:center;padding-right:10px}.player-toggle{display:flex;align-items:center;gap:10px;min-width:0;flex:1;min-height:74px;padding:13px 10px 13px 13px;text-align:left;background:transparent;border:0;color:inherit}.avatar{width:32px;min-width:32px;height:32px;border-radius:10px;background:var(--roster-tint);color:var(--crm-brand-link);display:grid;place-items:center;font-size:11px;font-weight:700}.identity{flex:1;min-width:0}.identity strong{display:block;font-size:14px;overflow-wrap:anywhere}.metadata{display:block;margin-top:3px;font-size:12px;color:var(--crm-muted,#596170);overflow-wrap:anywhere}.expanded{transform:rotate(180deg)}.edit{min-height:44px;padding:8px;color:var(--crm-brand-link);font-size:12px;font-weight:600;background:transparent;border:0}.edit:disabled{opacity:.4}
  .payment{border-top:1px solid var(--roster-line);padding:13px 15px 15px;background:var(--roster-tint)}.payment[hidden]{display:none}.payment dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0}.payment dt{font-size:11px;color:var(--crm-muted,#596170);margin-bottom:4px}.payment dd{font-size:clamp(14px,4.7vw,20px);font-weight:700;font-variant-numeric:tabular-nums;margin:0;overflow-wrap:anywhere}.remaining{color:var(--crm-brand-link)}.payment p{font-size:12px}.payment button{color:var(--crm-brand-link);min-height:44px}.empty{padding:24px 14px;text-align:center;font-size:13px}.scope-note{font-size:12px;margin-top:12px}
  .options-backdrop{position:fixed;inset:0;z-index:60;background:rgb(8 25 46 / .4);display:flex;align-items:flex-end;justify-content:center}.options{width:100%;max-width:440px;padding:14px 18px max(20px,env(safe-area-inset-bottom));background:var(--crm-surface,#fff);border-radius:22px 22px 0 0;max-height:90dvh;overflow:auto}.options header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.options h3{font-size:18px;font-weight:700}.options label{display:grid;gap:6px;margin:12px 0;font-size:12px;font-weight:600}.options select{width:100%;min-height:44px;border:1px solid var(--roster-line);border-radius:10px;padding:10px;background:var(--crm-surface,#fff)}.options>.crm-ui-button-primary{width:100%;margin-top:12px;min-height:44px}.tool{display:block;width:100%;text-align:left;min-height:50px;border-bottom:1px solid var(--roster-line);font-size:14px}
</style>
