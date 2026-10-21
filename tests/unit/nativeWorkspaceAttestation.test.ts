import { beforeEach, afterEach, expect, test, vi } from 'vitest';
const mocks=vi.hoisted(()=>({auth:{currentUser:undefined as {uid:string}|undefined},signIn:vi.fn(),signOut:vi.fn(),browser:vi.fn()}));
vi.mock('firebase/auth',()=>({signInWithCustomToken:mocks.signIn,signOut:mocks.signOut}));
vi.mock('firebase/app-check',()=>({getToken:mocks.browser}));
vi.mock('../../src/lib/firebase',()=>({auth:mocks.auth,appCheck:{},firebaseEnvironment:{config:{projectId:'huddleway-dev'}}}));
vi.mock('../../src/lib/config/publicEnvironment',()=>({publicEnvironment:{},resolveBackendUrl:()=> 'https://backend.test'}));
const nonce='n'.repeat(32);let messages:Array<Record<string,unknown>>;
let autoReply=false;
beforeEach(()=>{
 vi.useFakeTimers();vi.resetModules();vi.clearAllMocks();messages=[];autoReply=false;mocks.auth.currentUser={uid:'owner'};
 const win:any={location:{origin:'https://huddleway-dev-admin.web.app',pathname:'/admin/',search:'?nativeWorkspace=1'},addEventListener:vi.fn()};win.top=win;
 win.HuddleWayNative={postMessage:(raw:string)=>{const m=JSON.parse(raw);messages.push(m);if(autoReply&&m.type==='appCheckToken') win.huddlewayNativeAppCheckResponse?.({version:1,requestId:m.requestId,sequence:m.sequence,uid:m.uid,tenantId:m.tenantId,nonce:m.nonce,token:'genuine-provider-fixture'});}};
 vi.stubGlobal('window',win);mocks.browser.mockResolvedValue({token:'browser-provider-fixture'});
 mocks.signOut.mockImplementation(async()=>{mocks.auth.currentUser=undefined;});
 mocks.signIn.mockImplementation(async()=>{mocks.auth.currentUser={uid:'owner'};return{user:{uid:'owner'}};});
});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();});
async function setup(){const m=await import('../../src/lib/crm/nativeWorkspaceAttestation');m.beginNativeAttestation('owner',nonce,{appCheckProtocol:1,tenantId:'stem-it-up-sports'});return m;}
function reply(extra:Record<string,unknown>={}){const m=messages.at(-1)!;window.huddlewayNativeAppCheckResponse!({version:1,requestId:m.requestId,sequence:m.sequence,uid:m.uid,tenantId:m.tenantId,nonce:m.nonce,token:'genuine-provider-fixture',...extra});}
test('one-use main-frame pending proof and genuine-token response',async()=>{
 const m=await setup();const result=m.requestNativeAppCheck(true,()=>mocks.auth.currentUser?.uid);const id=messages.at(-1)!.requestId as string;
 expect(window.huddlewayNativeAppCheckContext!(id)).toMatchObject({mainFrame:true,trusted:true,uid:'owner',nonce,tenantId:'stem-it-up-sports'});
 expect(messages.at(-1)!.forceRefresh).toBe(true);reply();expect(await result).toBe('genuine-provider-fixture');
 expect(window.huddlewayNativeAppCheckContext!(id)).toBe(null);reply();expect(mocks.browser).not.toHaveBeenCalled();
});
test.each(['uid','tenantId','nonce','extra'])('crossed or unknown response %s cannot resolve',async(key)=>{
 const m=await setup();const result=m.requestNativeAppCheck(false,()=>mocks.auth.currentUser?.uid);const rejected=expect(result).rejects.toThrow('Native App Check unavailable.');
 reply({[key]:'crossed'});await vi.advanceTimersByTimeAsync(15_000);await rejected;
});
test('expired immutable deadline rejects context and response even before timer callback',async()=>{
 let now=0;vi.spyOn(performance,'now').mockImplementation(()=>now);
 const m=await setup();
 for(const path of ['context','response']){
  now=0;m.beginNativeAttestation('owner',nonce,{appCheckProtocol:1,tenantId:'stem-it-up-sports'});
  const result=m.requestNativeAppCheck(false,()=>mocks.auth.currentUser?.uid);const rejected=expect(result).rejects.toThrow();
  expect(vi.getTimerCount()).toBe(1);now=15_001;
  if(path==='context')expect(window.huddlewayNativeAppCheckContext!(messages.at(-1)!.requestId as string)).toBe(null);else reply();
  await rejected;expect(vi.getTimerCount()).toBe(0);
 }
});
test('identity switch and load replacement withhold stale tokens',async()=>{
 const m=await setup();const result=m.requestNativeAppCheck(false,()=>mocks.auth.currentUser?.uid);const rejected=expect(result).rejects.toThrow();
 mocks.auth.currentUser={uid:'other'};expect(window.huddlewayNativeAppCheckContext!(messages.at(-1)!.requestId as string)).toBe(null);reply();
 m.beginNativeAttestation('owner','m'.repeat(32),{appCheckProtocol:1,tenantId:'stem-it-up-sports'});await rejected;
});
test.each(['origin','frame','bridge','query'])('untrusted %s cannot admit or request native token',async(kind)=>{
 const m=await import('../../src/lib/crm/nativeWorkspaceAttestation');
 const location=window.location as unknown as {origin:string;search:string};
 if(kind==='origin')location.origin='https://other.test';if(kind==='frame')(window as any).top={};if(kind==='bridge')delete window.HuddleWayNative;if(kind==='query')location.search='';
 expect(()=>m.beginNativeAttestation('owner',nonce,{appCheckProtocol:1,tenantId:'stem-it-up-sports'})).toThrow();
 await expect(m.requestNativeAppCheck(false,()=> 'owner')).rejects.toThrow();expect(messages).toEqual([]);
});
test('authorization fired inside signIn callback before Promise resolves sees admitted context',async()=>{
 const m=await import('../../src/lib/crm/nativeWorkspaceAttestation');autoReply=true;
 mocks.signIn.mockImplementation(async()=>{mocks.auth.currentUser={uid:'owner'};expect(await m.requestNativeAppCheck(false,()=>mocks.auth.currentUser?.uid)).toBe('genuine-provider-fixture');return {user:{uid:'owner'}};});
 await import('../../src/lib/crm/nativeWorkspace');
 await window.huddlewayNativeSignIn!('custom-token-fixture','owner',nonce,{appCheckProtocol:1,tenantId:'stem-it-up-sports'});
 expect(messages.some(m=>m.type==='appCheckToken')).toBe(true);expect(messages.at(-1)!.type).toBe('signedIn');
});
test('standalone/legacy provider retained; admitted-native failure never falls back',async()=>{
 const {backendClient}=await import('../../src/lib/api/backendClient');
 // Exercise actual dependency closures without issuing any HTTP request.
 expect(await (backendClient as any).getAppCheckToken(false)).toBe('browser-provider-fixture');expect(mocks.browser).toHaveBeenCalledTimes(1);
 const m=await setup();m.clearNativeAttestation();await expect((backendClient as any).getAppCheckToken(false)).rejects.toThrow();expect(mocks.browser).toHaveBeenCalledTimes(1);
});
test('actual BackendApi mutation keeps genuine AppCheck header',async()=>{
 await setup();autoReply=true;mocks.auth.currentUser={uid:'owner',getIdToken:async()=> 'id-token-fixture'}as any;(mocks.auth as any).authStateReady=async()=>{};
 const {backendClient}=await import('../../src/lib/api/backendClient');const fetch=vi.fn().mockResolvedValue(new Response('{"ok":true}',{status:200}));(backendClient as any).fetchImplementation=fetch;
 await (backendClient as any).request('/admin/programs/stem-it-up-sports/test',{method:'POST',body:{value:true}});
 expect(fetch).toHaveBeenCalledTimes(1);expect(fetch.mock.calls[0][1].headers['X-Firebase-AppCheck']).toBe('genuine-provider-fixture');expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer id-token-fixture');expect(mocks.browser).not.toHaveBeenCalled();
});
