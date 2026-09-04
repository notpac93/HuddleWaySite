export function previewParityHarnessHtml({ options, previewUrl, session, update }) {
  const harness = JSON.stringify({
    previewOrigin: options.contract.previewOrigin,
    environment: options.contract.environment,
    tenantId: options.tenantId,
    expectedSourceCommit: options.expectedSourceCommit,
    expectedReleaseId: options.expectedReleaseId,
    previewUrl,
    session,
    update,
  }).replaceAll('<', '\\u003c');
  return `<!doctype html>
<html data-preview-state="loading">
  <head><meta charset="utf-8"><title>HuddleWay preview parity probe</title></head>
  <body>
    <iframe id="consumer-preview" title="Consumer preview parity probe"></iframe>
    <script>
      const contract = ${harness};
      const frame = document.getElementById('consumer-preview');
      const fail = (reason) => {
        document.documentElement.dataset.previewState = 'error';
        globalThis.__previewEvidence = { status: 'rejected', reason };
        throw new Error(reason);
      };
      window.addEventListener('message', (event) => {
        if (event.origin !== contract.previewOrigin || event.source !== frame.contentWindow) return;
        let message;
        try {
          message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        } catch (_) {
          fail('Consumer response was not valid JSON.');
        }
        if (
          !message
          || message.protocolVersion !== 1
          || message.environment !== contract.environment
          || message.tenantId !== contract.tenantId
          || message.sessionId !== contract.session.sessionId
          || message.nonce !== contract.session.nonce
        ) return;
        if (message.type === 'huddleway.crm.preview.rejected') {
          fail('Consumer rejected the probe: ' + String(message.reason || 'unknown'));
        }
        if (message.type === 'huddleway.crm.preview.ready') {
          if (
            message.sourceCommit !== contract.expectedSourceCommit
            || message.releaseId !== contract.expectedReleaseId
          ) {
            fail('Consumer ready attestation does not match the approved release.');
          }
          frame.contentWindow.postMessage(JSON.stringify(contract.update), contract.previewOrigin);
        }
        if (message.type === 'huddleway.crm.preview.applied' && message.revision === 1) {
          globalThis.__previewEvidence = {
            status: 'synced',
            sourceCommit: contract.expectedSourceCommit,
            releaseId: contract.expectedReleaseId,
            revision: message.revision,
          };
          document.documentElement.dataset.previewState = 'synced';
        }
      });
      frame.src = contract.previewUrl;
    </script>
  </body>
</html>`;
}
