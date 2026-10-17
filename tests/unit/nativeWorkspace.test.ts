import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { get } from 'svelte/store';
const mocks = vi.hoisted(() => ({ signIn: vi.fn(), signOut: vi.fn() }));
vi.mock('firebase/auth', () => ({signInWithCustomToken:mocks.signIn,signOut:mocks.signOut}));
vi.mock('../../src/lib/firebase', () => ({auth:{}}));
let messages: string[];
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); messages=[];
  vi.stubGlobal('window', {location:{origin:'https://huddleway-dev-admin.web.app',search:'?nativeWorkspace=1'},
    HuddleWayNative:{postMessage:(message:string)=>messages.push(JSON.parse(message).type)}});
  mocks.signOut.mockResolvedValue(undefined);
  mocks.signIn.mockResolvedValue({user:{uid:'owner'}});
});
afterEach(()=>vi.unstubAllGlobals());
test('waits for matching native identity before showing workspace',async()=>{
  const state=await import('../../src/lib/crm/nativeWorkspace');
  expect(get(state.nativeWorkspacePending)).toBe(true);
  expect(messages).toEqual(['ready']);
  await window.huddlewayNativeSignIn!('private-token','owner','nonce');
  expect(mocks.signIn).toHaveBeenCalledWith({},'private-token');
  expect(get(state.nativeWorkspacePending)).toBe(false);
  expect(messages).toEqual(['ready','signedIn']);
});
test('wrong identity remains hidden and is signed out',async()=>{
  const state=await import('../../src/lib/crm/nativeWorkspace');
  await window.huddlewayNativeSignIn!('private-token','different-user','nonce');
  expect(get(state.nativeWorkspacePending)).toBe(true);
  expect(mocks.signOut).toHaveBeenCalledTimes(2);
  expect(messages).toEqual(['ready','failed']);
});
test('failed authentication can retry without revealing stale content',async()=>{
  const state=await import('../../src/lib/crm/nativeWorkspace');
  mocks.signIn.mockRejectedValueOnce(new Error('offline'));
  await window.huddlewayNativeSignIn!('private-token','owner','nonce');
  expect(get(state.nativeWorkspacePending)).toBe(true);
  await window.huddlewayNativeSignIn!('new-token','owner','nonce');
  expect(get(state.nativeWorkspacePending)).toBe(false);
});
test('ordinary browser and untrusted origins do not install native handlers',async()=>{
  window.location.search='';
  const state=await import('../../src/lib/crm/nativeWorkspace');
  expect(state.isNativeWorkspace).toBe(false);
  expect(window.huddlewayNativeSignIn).toBeUndefined();
  expect(messages).toEqual([]);
});
