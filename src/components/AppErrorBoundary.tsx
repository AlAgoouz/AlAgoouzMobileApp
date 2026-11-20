import React from "react";
import { downloadRecoverySnapshot } from "../lib/backupExport";
import { readRecoveryDraft, type RecoveryDraftAccess } from "../lib/recoveryDraft";
import { reportBrowserIncident } from "../lib/observability";

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode; onReset?: () => void; recoveryAccess?: RecoveryDraftAccess },
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
      const state = this.props.recoveryAccess && readRecoveryDraft(this.props.recoveryAccess);
      if (!state) throw new Error("لا توجد نسخة استرداد محلية على هذا الجهاز.");
      downloadRecoverySnapshot(state);
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
        className="min-h-screen bg-surface-page text-ink-strong p-6 flex items-center justify-center"
      >
        <section
          role="alert"
          className="max-w-md w-full space-y-4 bg-surface-card border border-line-control rounded-xl p-6 shadow-sh-2"
        >
          <h1 className="text-xl font-extrabold text-ink-strong">
            {this.state.updateAvailable
              ? "تحديث التطبيق متاح"
              : "تعذر فتح الشاشة"}
          </h1>
          <p className="text-sm text-ink leading-relaxed">
            {this.state.updateAvailable
              ? "الصفحة المفتوحة تستخدم ملفات نسخة سابقة. حدّث التطبيق لتحميل النسخة الحالية."
              : "حدث خطأ أثناء عرض الشاشة. يمكنك تحديث التطبيق والمحاولة مرة أخرى."}
          </p>
          <p className="text-xs text-ink-faint leading-relaxed">
            لو عندك تعديلات لم يتأكد حفظها، نزّل نسخة الاسترداد المتاحة قبل
            التحديث. لا تحذف بيانات المتصفح.
          </p>
          <div className="space-y-2.5 pt-2">
            <button
              type="button"
              className="action-button w-full"
              onClick={this.exportRecovery}
            >
              حفظ نسخة الاسترداد المحلية
            </button>
            {this.props.onReset && (
              <button
                type="button"
                className="action-button w-full"
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
              type="button"
              className="action-button action-button-primary w-full"
              onClick={() => window.location.reload()}
            >
              تحديث التطبيق
            </button>
          </div>
          {this.state.exportMessage && (
            <p role="status" className="text-xs font-bold text-ink bg-surface-sunken border border-line rounded-md p-3">
              {this.state.exportMessage}
            </p>
          )}
        </section>
      </main>
    );
  }
}
