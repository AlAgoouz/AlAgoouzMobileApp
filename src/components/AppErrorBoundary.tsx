import React from "react";
import { createBackup } from "../lib/storeState";
import { recoveryDraftKey } from "../lib/recoveryDraft";
import { reportBrowserIncident } from "../lib/observability";

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode; onReset?: () => void },
  { failed: boolean; updateAvailable: boolean; exportMessage: string }
> {
  state = { failed: false, updateAvailable: false, exportMessage: "" };
  static getDerivedStateFromError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      failed: true,
      updateAvailable:
        /dynamically imported|loading chunk|chunkloaderror|module script/i.test(
          message,
        ),
    };
  }
  componentDidCatch() {
    reportBrowserIncident(this.state.updateAvailable ? "stale_application" : "render_failure");
  }

  exportRecovery = () => {
    try {
      const raw = localStorage.getItem(recoveryDraftKey);
      if (!raw) throw new Error("لا توجد نسخة استرداد محلية على هذا الجهاز.");
      const draft = JSON.parse(raw);
      const backup = createBackup(draft.state);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(backup, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `Agouz-Recovery-${Date.now()}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.setState({
        exportMessage: "تم تجهيز نسخة الاسترداد المحلية للتنزيل.",
      });
    } catch {
      this.setState({
        exportMessage:
          "لا توجد نسخة استرداد صالحة للتنزيل على هذا الجهاز؛ لا تحذف بيانات المتصفح إذا كانت لديك تعديلات تحتاج مراجعة.",
      });
    }
  };
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main
        dir="rtl"
        className="min-h-screen bg-[#1E1612] text-[#FBF5B7] p-6 flex items-center justify-center"
      >
        <section
          role="alert"
          className="max-w-md space-y-5 border border-[#C59B27] rounded-3xl p-6"
        >
          <h1 className="text-xl font-bold">
            {this.state.updateAvailable
              ? "تحديث التطبيق متاح"
              : "تعذر فتح الشاشة"}
          </h1>
          <p>
            {this.state.updateAvailable
              ? "الصفحة المفتوحة تستخدم ملفات نسخة سابقة. حدّث التطبيق لتحميل النسخة الحالية."
              : "حدث خطأ أثناء عرض الشاشة. يمكنك تحديث التطبيق والمحاولة مرة أخرى."}
          </p>
          <p>
            لو عندك تعديلات لم يتأكد حفظها، نزّل نسخة الاسترداد المتاحة قبل
            التحديث. لا تحذف بيانات المتصفح.
          </p>
          <button
            className="w-full rounded-xl p-3 border border-[#C59B27]"
            onClick={this.exportRecovery}
          >
            حفظ نسخة الاسترداد المحلية
          </button>
          {this.props.onReset && (
            <button
              className="w-full rounded-xl p-3 border border-[#C59B27]"
              onClick={() => {
                this.setState({
                  failed: false,
                  updateAvailable: false,
                  exportMessage: "",
                });
                this.props.onReset?.();
              }}
            >
              العودة للرئيسية
            </button>
          )}
          <button
            className="w-full rounded-xl p-3 bg-[#C59B27] text-[#1E1612] font-bold"
            onClick={() => window.location.reload()}
          >
            تحديث التطبيق
          </button>
          {this.state.exportMessage && (
            <p role="status">{this.state.exportMessage}</p>
          )}
        </section>
      </main>
    );
  }
}
