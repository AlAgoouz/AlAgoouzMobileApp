import {useEffect, useRef, useState} from 'react';
import type {QueuedCashierReport} from '../components/CashierDayScreen';
import {getSupabaseClient} from '../lib/supabaseSync';
import type {StoreEngine} from '../lib/storeEngine';

export function useCashierQueue(active:boolean, userId:string|undefined, engine:StoreEngine) {
  const [queueError, setQueueError] = useState("");
  const queueBusy = useRef(false);
  const [queuedReports,setQueuedReports]=useState<QueuedCashierReport[]>([]);
  useEffect(() => {
    if (!userId || !active) return;
    const sb = getSupabaseClient();
    if (!sb) return;
    let disposed = false;
    const processPending = async () => {
      if (disposed || queueBusy.current || document.visibilityState === "hidden" || !navigator.onLine || engine.snapshot.status !== "ready")
        return;
      queueBusy.current = true;
      try {
        const { data, error } = await sb
          .from("cashier_sync_queue")
          .select("id,file_name,sale_date,content_hash,report_kind,import_job_id")
          .eq("processed", false)
          .order("created_at")
          .limit(20);
        if (error) throw new Error("تعذر قراءة الملفات المعلقة للكاشير");
        if(!disposed){setQueuedReports(previous=>previous.length===data?.length&&previous.every((r,i)=>r.id===data[i].id&&r.content_hash===data[i].content_hash)?previous:data??[]);setQueueError('');}
      } catch (error) {
        if (!disposed)
          setQueueError(
            error instanceof Error ? error.message : "تعذر معالجة ملف الكاشير",
          );
      } finally {
        queueBusy.current = false;
      }
    };
    const channel = sb
      .channel("erp-cashier-v4")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "cashier_sync_queue" },
        () => {
          void processPending();
        },
      )
      .subscribe();
    const timer = setInterval(() => {
      void processPending();
    }, 15000);
    void processPending();
    window.addEventListener("online", processPending);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener("online", processPending);
      void sb.removeChannel(channel);
    };
  }, [userId, engine, active]);

  return {queueError,queuedReports,setQueuedReports};
}
