// @vitest-environment jsdom
import { it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act, cleanup } from '@testing-library/react';
import { emptyStore, toCloud } from '../src/lib/storeState';
import { useErpStore } from '../src/hooks/useErpStore';
const fake = vi.hoisted(() => ({ client: null as any }));
vi.mock('../src/lib/supabaseSync', () => ({
  getSupabaseClient: () => fake.client,
}));
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState(null,'','/');
});
function client(role = 'partner', user: any = { id: 'user1' }) {
  let authCallback: (event: string) => void = () => {};
  const sb = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user }, error: null })),
      signInWithPassword: vi.fn(async () => ({ error: null })),
      resetPasswordForEmail: vi.fn(async () => ({ error: null })),
      resend: vi.fn(async () => ({ error: null })),
      updateUser: vi.fn(async () => ({ error: null })),
      signOut: vi.fn(async () => {
        authCallback('SIGNED_OUT');
        return { error: null };
      }),
      onAuthStateChange: vi.fn((callback: any) => {
        authCallback = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
    from: vi.fn((table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () =>
            table === 'erp_members'
              ? { data: { partner_id: 'p1', role }, error: null }
              : { data: { ...toCloud(emptyStore), version: 0 }, error: null },
        }),
      }),
    })),
    channel: () => ({
      on() {
        return this;
      },
      subscribe() {
        return this;
      },
    }),
    removeChannel: vi.fn(),
  };
  fake.client = sb;
  return { sb, event: (event: string) => authCallback(event) };
}
it('never trusts a forged local owner identifier', async () => {
  sessionStorage.setItem('bon_elagouz_logged_owner_v2', 'p1');
  client('partner', null);
  const { result } = renderHook(() => useErpStore());
  await waitFor(() => expect(result.current.authReady).toBe(true));
  expect(result.current.member).toBeNull();
  expect(result.current.status).toBe('signed-out');
});

it('requests recovery and confirmation through Supabase with the approved application origin',async()=>{
  const {sb}=client('partner',null);
  const {result}=renderHook(()=>useErpStore());
  await waitFor(()=>expect(result.current.authReady).toBe(true));
  await act(()=>result.current.requestPasswordReset(' owner@example.test '));
  await act(()=>result.current.resendConfirmation(' owner@example.test '));
  expect(sb.auth.resetPasswordForEmail).toHaveBeenCalledWith('owner@example.test',{redirectTo:window.location.origin});
  expect(sb.auth.resend).toHaveBeenCalledWith({type:'signup',email:'owner@example.test',options:{emailRedirectTo:window.location.origin}});
});

it('refuses password changes outside recovery and rejects an expired verified session',async()=>{
  const {sb,event}=client('partner',null);
  const {result}=renderHook(()=>useErpStore());
  await waitFor(()=>expect(result.current.authReady).toBe(true));
  await expect(result.current.updateRecoveredPassword('a secure password')).rejects.toThrow('افتح رابط');
  act(()=>event('PASSWORD_RECOVERY'));
  await expect(result.current.updateRecoveredPassword('a secure password')).rejects.toThrow('انتهى');
  expect(sb.auth.updateUser).not.toHaveBeenCalled();
});

it('gates a recovery link before reading business data and revokes sessions after changing the password',async()=>{
  window.history.replaceState(null,'','/#type=recovery');
  const {sb}=client();
  const {result}=renderHook(()=>useErpStore());
  await waitFor(()=>expect(result.current.authReady).toBe(true));
  expect(result.current.passwordRecovery).toBe(true);
  expect(result.current.member).toBeNull();
  expect(sb.from).not.toHaveBeenCalled();
  await act(()=>result.current.updateRecoveredPassword('  a secure new password  '));
  expect(sb.auth.updateUser).toHaveBeenCalledWith({password:'  a secure new password  '});
  expect(sb.auth.signOut).toHaveBeenCalledWith({scope:'global'});
  expect(result.current.passwordRecovery).toBe(false);
  expect(window.location.hash).toBe('');
});

it('retries session revocation without changing the password twice',async()=>{
  window.history.replaceState(null,'','/#type=recovery');
  const {sb}=client();
  sb.auth.signOut.mockResolvedValueOnce({error:{status:503}} as any);
  const {result}=renderHook(()=>useErpStore());
  await waitFor(()=>expect(result.current.authReady).toBe(true));
  await act(async()=>{await expect(result.current.updateRecoveredPassword('a secure new password')).rejects.toThrow('تم تحديث');});
  expect(result.current.recoveryPasswordUpdated).toBe(true);
  await act(()=>result.current.updateRecoveredPassword(''));
  expect(sb.auth.updateUser).toHaveBeenCalledTimes(1);
  expect(sb.auth.signOut).toHaveBeenCalledTimes(2);
  expect(result.current.passwordRecovery).toBe(false);
});

it('stops an existing business session when a recovery event arrives',async()=>{
  const {event}=client();
  const {result}=renderHook(()=>useErpStore());
  await waitFor(()=>expect(result.current.status).toBe('ready'));
  act(()=>event('PASSWORD_RECOVERY'));
  expect(result.current.passwordRecovery).toBe(true);
  expect(result.current.member).toBeNull();
  expect(result.current.status).toBe('signed-out');
});
it('requires membership before loading store data', async () => {
  const { sb } = client('cashier');
  const { result } = renderHook(() => useErpStore());
  await waitFor(() => expect(result.current.authReady).toBe(true));
  expect(result.current.member).toBeNull();
  expect(result.current.authError).toContain('غير مخوّل');
  expect(
    sb.from.mock.calls.some((call) => call[0] === 'bon_elagouz_store'),
  ).toBe(false);
});
it('loads an authenticated partner and signs out through Supabase', async () => {
  const { sb } = client();
  const { result } = renderHook(() => useErpStore());
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.member?.userId).toBe('user1');
  await act(() => result.current.signOut());
  expect(sb.auth.signOut).toHaveBeenCalledOnce();
  expect(result.current.member).toBeNull();
});
it('preserves password whitespace and uses actual auth API', async () => {
  const { sb } = client('partner', null);
  const { result } = renderHook(() => useErpStore());
  await waitFor(() => expect(result.current.authReady).toBe(true));
  await act(() =>
    result.current.signIn(' owner@example.test ', '  secret  ', false),
  );
  expect(sb.auth.signInWithPassword).toHaveBeenCalledWith({
    email: 'owner@example.test',
    password: '  secret  ',
  });
  expect(localStorage.getItem('bon_elagouz_remember_auth')).toBe('no');
});
it('does not discard a draft on repeated SIGNED_IN events', async () => {
  const { event } = client();
  const { result } = renderHook(() => useErpStore());
  await waitFor(() => expect(result.current.status).toBe('ready'));
  act(() => result.current.engine.replace(emptyStore));
  const calls = fake.client.from.mock.calls.length;
  act(() => event('SIGNED_IN'));
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(fake.client.from.mock.calls.length).toBe(calls);
  expect(result.current.engine.hasPending).toBe(true);
  act(() => result.current.engine.logout());
});

it.each([
  [{ code: 'email_not_confirmed', status: 400 }, 'البريد لم يُؤكَّد'],
  [{ code: 'invalid_credentials', status: 400 }, 'البريد أو كلمة المرور غير صحيحين'],
  [{ code: 'over_request_rate_limit', status: 429 }, 'انتظر بضع دقائق'],
  [{ name: 'AuthRetryableFetchError', status: 0 }, 'تعذر الاتصال'],
  [{ status: 503 }, 'مشكلة مؤقتة'],
])('explains a rejected login without exposing service details: %j', async (error, message) => {
  const { sb } = client('partner', null);
  sb.auth.signInWithPassword.mockResolvedValueOnce({ error } as any);
  const { result } = renderHook(() => useErpStore());
  await waitFor(() => expect(result.current.authReady).toBe(true));
  await expect(result.current.signIn('owner@example.test', 'secret', false)).rejects.toThrow(message);
  expect(result.current.member).toBeNull();
});
