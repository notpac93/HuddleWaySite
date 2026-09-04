<script lang="ts">
  export let appName = '';
  export let disabled = false;
  export let onCaptureUndo: () => void;
</script>

<div class="space-y-6">
  <div>
    <label for="studio-app-name" class="block text-sm font-medium text-gray-700 mb-2">App Name</label>
    <input
      id="studio-app-name"
      type="text"
      bind:value={appName}
      on:focus={onCaptureUndo}
      maxlength="160"
      {disabled}
      class="crm-ui-studio-name"
    />
  </div>
</div>
