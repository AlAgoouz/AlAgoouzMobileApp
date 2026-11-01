import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getSupabaseClient } from '../lib/supabaseSync';
import { StoreEngine } from '../lib/storeEngine';
import { fromCloud, toCloud } from '../lib/storeState';
import { scrubLegacyPasswords } from '../lib/legacyCache';

export function useErpStore() {
  const [member, setMember] = useState<{
    userId: string;
    partnerId: string;
  } | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState('');
  const generation = useRef(0);
  const activeUser = useRef<string | null>(null);
  const engineRef = useRef<StoreEngine>();
  if (!engineRef.current) {
    engineRef.current = new StoreEngine(
      {
        async load() {
          const sb = getSupabaseClient();
          if (!sb) throw new Error('إعداد الاتصال غير صالح');
          const { data, error } = await sb
            .from('bon_elagouz_store')
            .select('*')
            .eq('id', 'main_store')
            .single();
          if (error)
            throw new Error(
              'تعذر تحميل بيانات المحل؛ تحقق من الاتصال وصلاحيات الحساب',
            );
          if (
            !Number.isSafeInteger(Number(data.version)) ||
            Number(data.version) < 0
          )
            throw new Error(
              'يلزم تطبيق ترقية الحفظ الآمن على قاعدة البيانات قبل التشغيل.',
            );
          return { state: fromCloud(data), version: Number(data.version) };
        },
        async save(state, version, operationId, queueId) {
          const sb = getSupabaseClient();
          if (!sb) throw new Error('إعداد الاتصال غير صالح');
          const { data, error } = await sb.rpc('bon_erp_save_store', {
            p_expected_version: version,
            p_state: toCloud(state),
            p_operation_id: operationId,
            p_queue_id: queueId ?? null,
          });
          if (error) throw new Error(error.message);
          if (!data || !Number.isSafeInteger(Number(data.version)))
            throw new Error('لم يصل تأكيد حفظ صالح');
          return Number(data.version);
        },
      },
      (state) => {
        // Preserve a draft before network writes. Legacy cache remains untouched for recovery.
        localStorage.setItem(
          'bon_elagouz_recovery_draft_v4',
          JSON.stringify({ savedAt: new Date().toISOString(), state }),
        );
      },
    );
  }
  const engine = engineRef.current;
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  useEffect(() => {
    const sb = getSupabaseClient();
    let disposed = false;
    try {
      scrubLegacyPasswords(localStorage);
    } catch {
      setAuthError(
        'تعذر تنظيف بيانات الدخول القديمة على هذا الجهاز؛ تحقق من مساحة التخزين.',
      );
    }
    if (!sb) {
      setAuthError('إعداد الاتصال غير صالح');
      setAuthReady(true);
      return;
    }
    const resolveUser = async () => {
      const run = ++generation.current;
      const {
        data: { user },
        error,
      } = await sb.auth.getUser();
      if (disposed || run !== generation.current) return;
      if (error || !user) {
        activeUser.current = null;
        setMember(null);
        engine.logout();
        setAuthReady(true);
        return;
      }
      if (
        activeUser.current === user.id &&
        engine.snapshot.status !== 'signed-out'
      ) {
        setAuthReady(true);
        return;
      }
      let { data: profile, error: profileError } = await sb
        .from('erp_members')
        .select('partner_id,role')
        .eq('user_id', user.id)
        .single();
      if (profileError || !profile) {
        const setup = await sb.rpc('bon_erp_bootstrap_owner');
        if (!setup.error) {
          const result = await sb
            .from('erp_members')
            .select('partner_id,role')
            .eq('user_id', user.id)
            .single();
          profile = result.data;
          profileError = result.error;
        }
      }
      if (disposed || run !== generation.current) return;
      if (profileError || profile?.role !== 'partner' || !profile.partner_id) {
        setAuthError('الحساب غير مخوّل للدخول كشريك');
        setMember(null);
        engine.logout();
      } else {
        activeUser.current = user.id;
        setAuthError('');
        setMember({ userId: user.id, partnerId: profile.partner_id });
        await engine.load();
      }
      if (!disposed) setAuthReady(true);
    };
    void resolveUser();
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        ++generation.current;
        activeUser.current = null;
        setMember(null);
        engine.logout();
      } else if (event === 'SIGNED_IN')
        setTimeout(() => {
          void resolveUser();
        }, 0);
    });
    return () => {
      disposed = true;
      ++generation.current;
      subscription.unsubscribe();
    };
  }, [engine]);
  useEffect(() => {
    if (!member) return;
    const sb = getSupabaseClient();
    if (!sb) return;
    const channel = sb
      .channel('erp-store-v4')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bon_elagouz_store',
          filter: 'id=eq.main_store',
        },
        () => {
          void engine.refresh();
        },
      )
      .subscribe();
    const timer = setInterval(() => {
      void engine.refresh();
    }, 15000);
    const refresh = () => {
      void engine.refresh();
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (engine.hasPending) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      clearInterval(timer);
      void sb.removeChannel(channel);
      window.removeEventListener('online', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [engine, member?.userId]);
  async function signIn(email: string, password: string, remember: boolean) {
    const sb = getSupabaseClient();
    if (!sb) throw new Error('إعداد الاتصال غير صالح');
    localStorage.setItem('bon_elagouz_remember_auth', remember ? 'yes' : 'no');
    const { error } = await sb.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error)
      throw new Error('تعذر الدخول؛ تحقق من البريد وكلمة المرور والاتصال');
  }
  async function signUp(email: string, password: string) {
    const sb = getSupabaseClient();
    if (!sb) throw new Error('إعداد الاتصال غير صالح');
    if (password.length < 12)
      throw new Error('اختر كلمة مرور من 12 حرفًا على الأقل');
    const { error } = await sb.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error)
      throw new Error(
        'تعذر إنشاء الحساب؛ تحقق من البريد أو سجل الدخول إذا كان موجودًا.',
      );
  }
  async function signOut() {
    if (engine.hasPending)
      throw new Error(
        'احفظ التعديلات أو احفظ نسخة منها ثم أعد التحميل قبل الخروج',
      );
    const sb = getSupabaseClient();
    const result = await sb?.auth.signOut();
    if (result?.error) throw new Error('تعذر إنهاء الجلسة؛ حاول مرة أخرى');
    setMember(null);
    engine.logout();
  }
  return {
    ...snapshot,
    engine,
    member,
    authReady,
    authError,
    signIn,
    signUp,
    signOut,
  };
}
