import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { get } from "svelte/store";
const mocks = vi.hoisted(() => ({ signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("firebase/auth", () => ({
  signInWithCustomToken: mocks.signIn,
  signOut: mocks.signOut,
}));
vi.mock("../../src/lib/firebase", () => ({ auth: {} }));
const nonce = "n".repeat(32);
let messages: Array<{ type: string; nonce: string }>;
const bridge = () => ({
  postMessage: (message: string) => messages.push(JSON.parse(message)),
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.clearAllMocks();
  messages = [];
  vi.stubGlobal("window", {
    location: {
      origin: "https://huddleway-dev-admin.web.app",
      pathname: "/admin/",
      search: "?nativeWorkspace=1",
    },
    HuddleWayNative: bridge(),
    addEventListener: vi.fn(),
  });
  mocks.signOut.mockResolvedValue(undefined);
  mocks.signIn.mockResolvedValue({ user: { uid: "owner" } });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
test("waits for matching native identity before showing workspace", async () => {
  const state = await import("../../src/lib/crm/nativeWorkspace");
  expect(get(state.nativeWorkspacePending)).toBe(true);
  expect(messages).toEqual([{ type: "ready", nonce: "" }]);
  await window.huddlewayNativeSignIn!("private-token", "owner", nonce);
  expect(mocks.signIn).toHaveBeenCalledWith({}, "private-token");
  expect(get(state.nativeWorkspacePending)).toBe(false);
  expect(messages).toEqual([
    { type: "ready", nonce: "" },
    { type: "signedIn", nonce },
  ]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(messages).toHaveLength(2);
});
test("wrong identity remains hidden and is signed out", async () => {
  const state = await import("../../src/lib/crm/nativeWorkspace");
  await window.huddlewayNativeSignIn!("private-token", "different-user", nonce);
  expect(get(state.nativeWorkspacePending)).toBe(true);
  expect(mocks.signOut).toHaveBeenCalledTimes(2);
  expect(messages.map((message) => message.type)).toEqual(["ready", "failed"]);
});
test("failed authentication can retry without revealing stale content", async () => {
  const state = await import("../../src/lib/crm/nativeWorkspace");
  mocks.signIn.mockRejectedValueOnce(new Error("offline"));
  await window.huddlewayNativeSignIn!("private-token", "owner", nonce);
  expect(get(state.nativeWorkspacePending)).toBe(true);
  await window.huddlewayNativeSignIn!("new-token", "owner", nonce);
  expect(get(state.nativeWorkspacePending)).toBe(false);
});
test.each([
  ["https://huddleway-crm-canary.web.app", "/admin/", "?nativeWorkspace=1"],
  ["http://huddleway-dev-admin.web.app", "/admin/", "?nativeWorkspace=1"],
  ["https://huddleway-dev-admin.web.app", "/account/", "?nativeWorkspace=1"],
  ["https://huddleway-dev-admin.web.app", "/admin/", ""],
])(
  "ordinary browser or untrusted context never installs native handlers: %s %s %s",
  async (origin, pathname, search) => {
    Object.assign(window.location, { origin, pathname, search });
    const state = await import("../../src/lib/crm/nativeWorkspace");
    expect(state.isNativeWorkspace).toBe(false);
    expect(window.huddlewayNativeSignIn).toBeUndefined();
    expect(window.huddlewayNativeReady).toBeUndefined();
    expect(window.huddlewayNativeBootStatus).toBeUndefined();
    expect(messages).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  },
);
test("late Android interface receives ready without reloading or losing the pending guard", async () => {
  delete window.HuddleWayNative;
  const state = await import("../../src/lib/crm/nativeWorkspace");
  expect(state.isNativeWorkspace).toBe(true);
  expect(get(state.nativeWorkspacePending)).toBe(true);
  expect(window.huddlewayNativeSignIn).toBeTypeOf("function");
  expect(messages).toEqual([]);
  await vi.advanceTimersByTimeAsync(750);
  window.HuddleWayNative = bridge();
  await vi.advanceTimersByTimeAsync(250);
  expect(messages).toEqual([{ type: "ready", nonce: "" }]);
  window.huddlewayNativeReady!(nonce);
  expect(messages.at(-1)).toEqual({ type: "ready", nonce });
  await window.huddlewayNativeSignIn!("private-token", "owner", nonce);
  expect(get(state.nativeWorkspacePending)).toBe(false);
});
test("reannounces after a missed first delivery or temporarily throwing interface", async () => {
  window.HuddleWayNative = {
    postMessage: () => {
      throw new Error("interface initializing");
    },
  };
  await import("../../src/lib/crm/nativeWorkspace");
  window.HuddleWayNative = bridge();
  await vi.advanceTimersByTimeAsync(250);
  expect(messages.map((message) => message.type)).toEqual(["ready"]);
  await vi.advanceTimersByTimeAsync(250);
  expect(messages.map((message) => message.type)).toEqual(["ready", "ready"]);
});
test("challenge replies bind the load and reject invalid or stale sign-in nonces", async () => {
  const state = await import("../../src/lib/crm/nativeWorkspace");
  window.huddlewayNativeReady!("short");
  expect(messages).toHaveLength(1);
  window.huddlewayNativeReady!(nonce);
  expect(messages.at(-1)).toEqual({ type: "ready", nonce });
  await window.huddlewayNativeSignIn!("private-token", "owner", "m".repeat(32));
  await window.huddlewayNativeSignIn!("private-token", "owner", "short");
  expect(mocks.signIn).not.toHaveBeenCalled();
  expect(get(state.nativeWorkspacePending)).toBe(true);
  await window.huddlewayNativeSignIn!("private-token", "owner", nonce);
  expect(get(state.nativeWorkspacePending)).toBe(false);
});
test("readiness retries stop after45seconds and do not install a later interface implicitly", async () => {
  delete window.HuddleWayNative;
  const state = await import("../../src/lib/crm/nativeWorkspace");
  await vi.advanceTimersByTimeAsync(45_001);
  expect(vi.getTimerCount()).toBe(0);
  window.HuddleWayNative = bridge();
  await vi.advanceTimersByTimeAsync(1000);
  expect(messages).toEqual([]);
  expect(get(state.nativeWorkspacePending)).toBe(true);
});
test("the diagnostic probe exposes only coarse booleans", async () => {
  await import("../../src/lib/crm/nativeWorkspace");
  expect(window.huddlewayNativeBootStatus!()).toEqual({
    contextModuleReady: true,
    trustedContext: true,
    bridgeAvailable: true,
    signInHandlerReady: true,
    readyHandlerReady: true,
  });
  expect(
    Object.values(window.huddlewayNativeBootStatus!()).every(
      (value) => typeof value === "boolean",
    ),
  ).toBe(true);
  window.location.pathname = "/account/";
  window.huddlewayNativeReady!(nonce);
  await window.huddlewayNativeSignIn!("private-token", "owner", nonce);
  expect(mocks.signIn).not.toHaveBeenCalled();
  expect(messages).toHaveLength(1);
  expect(window.huddlewayNativeBootStatus!().trustedContext).toBe(false);
});

test("leaving the main frame stops ready announcements", async () => {
  await import("../../src/lib/crm/nativeWorkspace");
  const callback = vi
    .mocked(window.addEventListener)
    .mock.calls.find((call) => call[0] === "pagehide")?.[1] as () => void;
  expect(callback).toBeTypeOf("function");
  callback();
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(1000);
  expect(messages).toHaveLength(1);
});

test('authorization diagnostics bind the current load and omit arbitrary SDK/identity payloads', async () => {
  const context = await import('../../src/lib/crm/nativeWorkspaceContext');
  expect(context.notifyNativeAuthorization({state:'resolved'})).toBe(false);
  context.setNativeWorkspaceNonce(nonce);
  expect(context.notifyNativeAuthorization({state:'attempt_failed',phase:'app_check',reason:'recaptcha_error',attempt:2,elapsedMs:20})).toBe(true);
  expect(messages).toEqual([{type:'authorization',nonce,state:'attempt_failed',phase:'app_check',reason:'recaptcha_error',attempt:2,elapsedMs:20}]);
  context.notifyNativeAuthorization({state:'exhausted',phase:'private-token',reason:'private-uid',httpStatus:999,attempt:9,elapsedMs:-1});
  expect(messages.at(-1)).toEqual({type:'authorization',nonce,state:'exhausted'});
  window.location.pathname = '/account/';
  expect(context.notifyNativeAuthorization({state:'resolved'})).toBe(false);
  expect(messages).toHaveLength(2);
});
