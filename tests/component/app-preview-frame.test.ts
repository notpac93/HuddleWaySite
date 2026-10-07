import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import AppPreviewFrame from '../../src/components/crm/app/AppPreviewFrame.svelte';
import { tick } from 'svelte';

const origin = 'https://huddleway-app-preview-canary.web.app';
const sourceCommit = 'a'.repeat(40);
const releaseId = 'consumer-stage-fixture';
const configuration = { name: 'STEM It Up Sports', primaryColor: '#0b5c42', secondaryColor: '#0f2747',
  tertiaryColor: '#f4b41a', logoUrl: null, navigationTabs: [{ key: 'home', pageId: 'home', label: 'Home', route: '/', enabled: true }] };
function mount(configurationReady = true) {
  return render(AppPreviewFrame, { previewOrigin: origin, tenantId: 'stem-it-up-sports', environment: 'stage',
    configuration, configurationReady, title: 'Consumer fixture preview', expectedSourceCommit: sourceCommit, expectedReleaseId: releaseId });
}
function message(frame: HTMLIFrameElement, type: 'ready' | 'applied', extra = {}, originOverride = origin) {
  const query = new URL(frame.src).searchParams;
  window.dispatchEvent(new MessageEvent('message', { origin: originOverride, source: frame.contentWindow,
    data: JSON.stringify({ type: `huddleway.crm.preview.${type}`, protocolVersion: 1,
      tenantId: 'stem-it-up-sports', environment: 'stage', sessionId: query.get('previewSession'), nonce: query.get('previewNonce'),
      sourceCommit, releaseId, ...extra }) }));
}

describe('live consumer preview handshake', () => {
  it('sends an initial fixed draft and hides verification only after the matching acknowledgement', async () => {
    mount(); const frame = screen.getByTitle('Consumer fixture preview') as HTMLIFrameElement;
    const send = vi.spyOn(frame.contentWindow!, 'postMessage');
    await fireEvent.load(frame); message(frame, 'ready');
    await waitFor(() => expect(send).toHaveBeenCalled());
    const payload = JSON.parse(send.mock.calls.at(-1)![0] as string);
    expect(payload.configuration.name).toBe(configuration.name);
    expect(screen.getByRole('status')).toBeInTheDocument();
    message(frame, 'applied', { revision: payload.revision });
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('waits for source attestation before posting a late configuration', async () => {
    const view = mount(false); const frame = screen.getByTitle('Consumer fixture preview') as HTMLIFrameElement;
    const send = vi.spyOn(frame.contentWindow!, 'postMessage');
    await fireEvent.load(frame); await view.rerender({ configurationReady: true });
    expect(send).not.toHaveBeenCalled();
    message(frame, 'ready', { sourceCommit: 'b'.repeat(40) });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('does not match'));
    expect(send).not.toHaveBeenCalled();
  });

  it('does not lose a completed handshake when the iframe load event arrives after its ready message', async () => {
    mount(); const frame = screen.getByTitle('Consumer fixture preview') as HTMLIFrameElement;
    const send = vi.spyOn(frame.contentWindow!, 'postMessage');
    message(frame, 'ready');
    await waitFor(() => expect(send).toHaveBeenCalled());
    const payload = JSON.parse(send.mock.calls.at(-1)![0] as string);
    message(frame, 'applied', { revision: payload.revision });
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    await fireEvent.load(frame);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('requires the current session and trusted origin for acknowledgement', async () => {
    mount(); const frame = screen.getByTitle('Consumer fixture preview') as HTMLIFrameElement;
    const send = vi.spyOn(frame.contentWindow!, 'postMessage');
    await fireEvent.load(frame); message(frame, 'ready', {}, 'https://untrusted.example');
    expect(send).not.toHaveBeenCalled();
    message(frame, 'applied', { revision: 1 });
    await tick();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('sends configuration that arrives after a valid ready response', async () => {
    const view = mount(false); const frame = screen.getByTitle('Consumer fixture preview') as HTMLIFrameElement;
    const send = vi.spyOn(frame.contentWindow!, 'postMessage');
    await fireEvent.load(frame); message(frame, 'ready'); await tick();
    expect(send).not.toHaveBeenCalled();
    await view.rerender({ configurationReady: true });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  });
});
