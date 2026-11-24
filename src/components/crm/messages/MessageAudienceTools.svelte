<script lang="ts">
  import { backendClient } from '../../../lib/api/backendClient';
  import { createIdempotencyKey } from '../../../lib/api/BackendApi';
  import { modalFocus } from '../../../lib/ui/modalFocus';

  export let tenantId: string;

  const kinds = ['event', 'team', 'season'] as const;
  type Kind = typeof kinds[number];
  type Audience = { kind: Kind; id: string; title: string; startDate?: string; past?: boolean };
  type Contact = { directorDirectMessagingEnabled: boolean; directorResponseDisclaimer: string };
  type Preview = { emailEligibleCount: number; emailSuppressedCount: number };

  let panel: 'email' | 'director' | null = null;
  let activeTenant = '';
  let generation = 0;
  let audiences: Audience[] = [];
  let kind: Kind = 'event';
  let audienceId = '';
  let subject = '';
  let body = '';
  let preview: Preview | null = null;
  let result = '';
  let key = '';
  let contact: Contact | null = null;
  let busy = false;
  let error = '';
  let notice = '';

  $: if (activeTenant !== tenantId) {
    activeTenant = tenantId;
    close();
    notice = '';
  }
  $: choices = audiences.filter((item) => item.kind === kind).sort((a, b) =>
    Number(Boolean(a.past)) - Number(Boolean(b.past))
    || (a.startDate && b.startDate
      ? (a.past ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate))
      : a.title.localeCompare(b.title))
  );
  $: canReview = Boolean(audienceId && subject.trim() && body.trim());

  function resetReview() {
    preview = null;
    key = '';
    error = '';
  }

  function close() {
    generation += 1;
    panel = null;
    busy = false;
    audiences = [];
    audienceId = '';
    kind = 'event';
    subject = '';
    body = '';
    result = '';
    contact = null;
    resetReview();
  }

  async function perform(action: (scope: string, apply: (update: () => void) => void) => Promise<void>) {
    const current = ++generation;
    const scope = tenantId;
    const apply = (update: () => void) => {
      if (current === generation && scope === tenantId) update();
    };
    busy = true;
    error = '';
    try {
      await action(scope, apply);
    } catch (errorValue) {
      apply(() => error = errorValue instanceof Error ? errorValue.message : 'Try again.');
    } finally {
      apply(() => busy = false);
    }
  }

  function loadEmail() {
    panel = 'email';
    notice = '';
    void perform(async (scope, apply) => {
      const payload = await backendClient.request<{ tenantId: string; audiences: Audience[] }>(
        '/admin/messages/email-audiences', { query: { tenantId: scope } },
      );
      if (payload.tenantId !== scope || !Array.isArray(payload.audiences)) throw new Error('Could not load audiences.');
      apply(() => audiences = payload.audiences);
    });
  }

  function loadSettings() {
    panel = 'director';
    notice = '';
    void perform(async (scope, apply) => {
      const payload = await backendClient.request<{ tenantId: string; policy: Contact }>(
        '/admin/messaging/settings', { query: { tenantId: scope } },
      );
      if (payload.tenantId !== scope || typeof payload.policy?.directorDirectMessagingEnabled !== 'boolean') {
        throw new Error('Could not load director messaging settings.');
      }
      apply(() => contact = {
        directorDirectMessagingEnabled: payload.policy.directorDirectMessagingEnabled,
        directorResponseDisclaimer: payload.policy.directorResponseDisclaimer,
      });
    });
  }

  function saveSettings() {
    if (!contact) return;
    const directorContact = { ...contact };
    void perform(async (scope, apply) => {
      const payload = await backendClient.request<{ tenantId: string; success: boolean }>(
        '/admin/messaging/settings', { method: 'PUT', body: { tenantId: scope, directorContact } },
      );
      if (payload.tenantId !== scope || !payload.success) throw new Error('Could not save director messaging settings.');
      apply(() => {
        close();
        notice = 'Director messaging settings saved.';
      });
    });
  }

  function reviewEmail() {
    if (!canReview) return;
    const quickTarget = { kind, id: audienceId };
    void perform(async (scope, apply) => {
      const payload = await backendClient.request<Preview & { tenantId: string }>(
        '/admin/messages/audience-preview',
        { method: 'POST', body: { tenantId: scope, quickTarget, emailRequested: true } },
      );
      if (payload.tenantId !== scope || !Number.isInteger(payload.emailEligibleCount)) {
        throw new Error('Could not check email recipients.');
      }
      apply(() => preview = payload);
    });
  }

  function sendEmail() {
    if (!preview?.emailEligibleCount || !canReview) return;
    const audience = choices.find((item) => item.id === audienceId);
    if (!audience) return;
    key ||= createIdempotencyKey('mass-email');
    void perform(async (scope, apply) => {
      const payload = await backendClient.request<{ tenantId: string; sentCount: number; failedCount: number }>(
        '/communications/one-way-email',
        {
          method: 'POST',
          idempotencyKey: key,
          body: {
            tenantId: scope,
            audience: { quickTarget: { kind, id: audienceId } },
            channels: { push: false },
            communication: {
              type: 'update',
              subject: subject.trim(),
              message: body.trim(),
              ...(kind === 'event' ? { eventTitle: audience.title } : {}),
            },
          },
        },
      );
      if (payload.tenantId !== scope || !Number.isInteger(payload.sentCount) || !Number.isInteger(payload.failedCount)) {
        throw new Error('Could not confirm email delivery.');
      }
      apply(() => result = `${payload.sentCount} sent. ${payload.failedCount} failed.`);
    });
  }

  function audienceLabel(audience: Audience) {
    const date = audience.startDate
      ? new Date(audience.startDate).toLocaleDateString(undefined, { dateStyle: 'medium' })
      : '';
    return [audience.title, date, audience.past ? 'Past' : ''].filter(Boolean).join(' · ');
  }
</script>

{#if tenantId}
  <div class="mt-4 flex flex-wrap gap-3">
    <button type="button" class="crm-auth-button-secondary" on:click={loadEmail}>Mass email</button>
    <button type="button" class="crm-auth-button-secondary" on:click={loadSettings}>Director messaging</button>
  </div>
  {#if notice}<p class="crm-ui-message-success mt-3" role="status">{notice}</p>{/if}
{/if}

{#if panel}
  <div class="crm-ui-modal-root" role="dialog" aria-modal="true" aria-labelledby="message-audience-tool-title">
    <div class="flex min-h-full items-center justify-center p-4">
      <button class="crm-ui-backdrop" type="button" tabindex="-1" aria-label="Close dialog" disabled={busy} on:click={close}></button>
      <div class="crm-announcement-review crm-message-dialog crm-theme-default-host crm-auth-card" tabindex="-1"
        use:modalFocus={{ onEscape: () => { if (!busy) close(); } }}>
        <h3 id="message-audience-tool-title">{panel === 'email' ? 'Mass email' : 'Director messaging'}</h3>
        {#if panel === 'director'}
          {#if contact}
            <label class="mt-4 flex items-center gap-3">
              <input type="checkbox" bind:checked={contact.directorDirectMessagingEnabled} disabled={busy} />
              Allow messages to the director
            </label>
            <label class="crm-ui-label mt-3 block" for="director-response-note">Response note</label>
            <textarea id="director-response-note" class="crm-ui-message-field" rows="3" maxlength="500"
              bind:value={contact.directorResponseDisclaimer} disabled={busy}></textarea>
            <p class="crm-ui-hint">Shown before a member sends a message.</p>
          {:else if busy}
            <p role="status">Loading settings…</p>
          {/if}
        {:else if result}
          <p role="status">{result}</p>
        {:else}
          <div class="mt-4 grid gap-3">
            <label class="crm-ui-label" for="mass-email-kind">Audience type</label>
            <select id="mass-email-kind" class="crm-ui-message-field" bind:value={kind} disabled={busy}
              on:change={() => { audienceId = ''; resetReview(); }}>
              <option value="event">Event</option><option value="team">Team</option><option value="season">Season</option>
            </select>
            <label class="crm-ui-label" for="mass-email-target">Recipients</label>
            <select id="mass-email-target" class="crm-ui-message-field" bind:value={audienceId} disabled={busy} on:change={resetReview}>
              <option value="">{choices.length ? 'Choose an audience' : 'No audiences available'}</option>
              {#each choices as audience (audience.id)}
                <option value={audience.id}>{audienceLabel(audience)}</option>
              {/each}
            </select>
            <label class="crm-ui-label" for="mass-email-subject">Subject</label>
            <input id="mass-email-subject" class="crm-ui-message-field" maxlength="200"
              bind:value={subject} disabled={busy} on:input={resetReview} />
            <label class="crm-ui-label" for="mass-email-body">Message</label>
            <textarea id="mass-email-body" class="crm-ui-message-field" rows="4" maxlength="4000"
              bind:value={body} disabled={busy} on:input={resetReview}></textarea>
          </div>
          {#if preview}<p role="status" class="mt-3">{preview.emailEligibleCount} eligible email recipients.{preview.emailSuppressedCount ? ` ${preview.emailSuppressedCount} excluded.` : ''}</p>{/if}
        {/if}
        {#if error}<p class="crm-compose-error" role="alert">{error}</p>{/if}
        <footer class="crm-announcement-review-actions">
          <button type="button" class="crm-auth-button-secondary" on:click={close} disabled={busy}>{result ? 'Done' : 'Cancel'}</button>
          {#if panel === 'director'}
            {#if contact}
              <button type="button" class="crm-auth-button-primary" on:click={saveSettings} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            {:else if error}
              <button type="button" class="crm-auth-button-primary" on:click={loadSettings}>Retry</button>
            {/if}
          {:else if !result}
            {#if error && !audiences.length}
              <button type="button" class="crm-auth-button-primary" on:click={loadEmail}>Retry</button>
            {:else if preview}
              <button type="button" class="crm-auth-button-primary" on:click={sendEmail} disabled={busy || !preview.emailEligibleCount}>{busy ? 'Sending…' : 'Send email'}</button>
            {:else}
              <button type="button" class="crm-auth-button-primary" on:click={reviewEmail} disabled={busy || !canReview}>{busy ? 'Loading…' : 'Review recipients'}</button>
            {/if}
          {/if}
        </footer>
      </div>
    </div>
  </div>
{/if}
