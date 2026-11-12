// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { AppErrorBoundary } from "../src/components/AppErrorBoundary";
import { emptyStore } from "../src/lib/storeState";
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});
it("shows recovery instead of a white page after an old deployment chunk disappears", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const draft = JSON.stringify({
    savedAt: "2026-11-01T00:00:00Z",
    state: emptyStore,
  });
  localStorage.setItem("bon_elagouz_recovery_draft_v4", draft);
  const Screen = React.lazy(() =>
    Promise.reject(
      new TypeError(
        "Failed to fetch dynamically imported module: /assets/old.js",
      ),
    ),
  );
  render(
    <AppErrorBoundary>
      <React.Suspense fallback="Loading">
        <Screen />
      </React.Suspense>
    </AppErrorBoundary>,
  );
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByRole("heading").textContent).toBe("تحديث التطبيق متاح");
  expect(screen.getByRole("button", { name: "تحديث التطبيق" })).toBeTruthy();
  expect(localStorage.getItem("bon_elagouz_recovery_draft_v4")).toBe(draft);
});
it("keeps a general failure recoverable when local recovery data is malformed", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  localStorage.setItem("bon_elagouz_recovery_draft_v4", "{invalid");
  const Broken = () => {
    throw new Error("render failure");
  };
  render(
    <AppErrorBoundary>
      <Broken />
    </AppErrorBoundary>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "حفظ نسخة الاسترداد المحلية" }),
  );
  expect(screen.getByRole("status").textContent).toContain(
    "لا توجد نسخة استرداد صالحة",
  );
  expect(localStorage.getItem("bon_elagouz_recovery_draft_v4")).toBe(
    "{invalid",
  );
});
it("allows resetting a failed screen boundary back to the home screen without reloading", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let shouldThrow = true;
  const Screen = () => {
    if (shouldThrow) throw new Error("screen crash");
    return <div>Recovered Screen</div>;
  };
  const onReset = vi.fn(() => {
    shouldThrow = false;
  });
  render(
    <AppErrorBoundary onReset={onReset}>
      <Screen />
    </AppErrorBoundary>,
  );
  expect(screen.getByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "العودة للرئيسية" }));
  expect(onReset).toHaveBeenCalledOnce();
  expect(screen.getByText("Recovered Screen")).toBeTruthy();
});
