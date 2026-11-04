<script lang="ts">
  export let value: 'form' | 'easy' = 'form';
</script>
<fieldset class="method-picker"><legend>Registration method</legend><div class="choices">
  <label class:selected={value === 'easy'}><input type="radio" bind:group={value} value="easy" />Easy registration</label>
  <label class:selected={value === 'form'}><input type="radio" bind:group={value} value="form" />Registration form</label>
</div>{#if value === 'easy'}<p>Account name, email and phone · Participant name</p>{/if}</fieldset>
<style>
.method-picker{margin:16px 0}.method-picker legend{font-size:14px;font-weight:600;margin-bottom:8px}.choices{display:grid;grid-template-columns:1fr 1fr;gap:10px}.choices label{display:flex;align-items:center;gap:8px;min-height:60px;padding:12px;border:1px solid #dce3ed;border-radius:12px;font-size:14px;cursor:pointer}.choices label.selected{border-color:var(--crm-brand-link);background:var(--crm-brand-surface);color:var(--crm-on-brand-surface)}input{accent-color:var(--crm-brand-link)}p{margin-top:10px;font-size:13px;color:var(--crm-text-muted,#64748b)}
</style>
