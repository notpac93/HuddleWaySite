<script lang="ts">
  export let price = '';
  export let choice: 'pay_in_full' | 'installments' = 'pay_in_full';
  export let installmentCount = 3;
  export let cadence: 'weekly' | 'monthly' = 'monthly';
  export let cancellationPolicy = '';
  export let refundPolicy = '';

  $: priceCents = /^\d+(\.\d{1,2})?$/.test(price.trim())
    ? Math.round(Number(price) * 100)
    : 0;
  $: splitAmounts = choice === 'installments' && installmentCount > 1 && priceCents >= installmentCount
    ? Array.from({ length: installmentCount }, (_, index) => {
      const base = Math.floor(priceCents / installmentCount);
      return index === installmentCount - 1 ? priceCents - base * (installmentCount - 1) : base;
    })
    : [];

  function money(cents: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  }

  function installmentTiming(index: number) {
    if (index === 0) return 'due at enrollment';
    const unit = cadence === 'weekly' ? 'week' : 'month';
    return `due ${index} ${unit}${index === 1 ? '' : 's'} after enrollment${index === splitAmounts.length - 1 ? ' (final payment)' : ''}`;
  }
</script>

<section class="rounded-xl border border-gray-200 bg-white p-4">
  <h4 class="font-semibold text-gray-950">Registration cost</h4>
  <p class="mt-1 text-xs text-gray-600">Leave the price at $0 for a free event.</p>
  <label class="mt-3 block"><span class="crm-ui-label">Price</span><div class="relative mt-1"><span class="absolute left-3 top-2 text-gray-500">$</span><input class="crm-ui-input pl-7" inputmode="decimal" bind:value={price} aria-label="Event registration price" /></div></label>
  {#if priceCents > 0}
    <fieldset class="mt-4"><legend class="crm-ui-label">How can families pay?</legend><div class="mt-2 grid gap-2 sm:grid-cols-2"><label class="rounded-lg border p-3"><input type="radio" bind:group={choice} value="pay_in_full" /> <span class="ml-2 font-medium">Pay in full only</span></label><label class="rounded-lg border p-3"><input type="radio" bind:group={choice} value="installments" /> <span class="ml-2 font-medium">Allow split payments</span></label></div></fieldset>
    {#if choice === 'installments'}
      <div class="mt-3 grid gap-3 sm:grid-cols-2"><label><span class="crm-ui-label">Payments</span><select class="crm-ui-input mt-1" bind:value={installmentCount}>{#each Array.from({ length: 11 }, (_, i) => i + 2) as count}<option value={count}>{count}</option>{/each}</select></label><label><span class="crm-ui-label">Frequency</span><select class="crm-ui-input mt-1" bind:value={cadence}><option value="monthly">Monthly</option><option value="weekly">Weekly</option></select></label></div>
      {#if splitAmounts.length}<div class="mt-3 rounded-lg bg-[var(--crm-brand-surface)] p-3 text-sm text-[var(--crm-on-brand-surface)]"><strong>{splitAmounts.length} family payments</strong><p class="mt-1 text-xs">Dates are calculated from enrollment.</p><ol class="mt-2 grid gap-1">{#each splitAmounts as amount, index}<li>Payment {index + 1}: {money(amount)} · {installmentTiming(index)}</li>{/each}</ol></div>{/if}
    {/if}
    <div class="mt-4 grid gap-3"><label><span class="crm-ui-label">Cancellation policy</span><textarea class="crm-ui-input mt-1" rows="2" maxlength="4000" bind:value={cancellationPolicy} placeholder="What happens if a registration is cancelled?"></textarea></label><label><span class="crm-ui-label">Refund policy</span><textarea class="crm-ui-input mt-1" rows="2" maxlength="4000" bind:value={refundPolicy} placeholder="When are payments refundable?"></textarea></label></div>
  {/if}
</section>
