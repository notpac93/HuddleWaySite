<script lang="ts">
  export let activeTeam: any = null;
</script>
<p>Financial records fixture{activeTeam?.name ? ` · ${activeTeam.name}` : ''}</p>
