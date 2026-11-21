import { useEffect, useRef, type ReactNode } from 'react';

export function AuthenticationLayout({ children }: { children: ReactNode }) {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof window.matchMedia !== 'function') return;

    const motion = window.matchMedia(
      '(min-width: 768px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
    );
    let frame = 0;
    const reset = () => {
      cancelAnimationFrame(frame);
      stage.style.removeProperty('--portrait-x');
      stage.style.removeProperty('--portrait-y');
    };
    const followPointer = (event: PointerEvent) => {
      if (!motion.matches || event.pointerType !== 'mouse') return;
      cancelAnimationFrame(frame);
      const { clientX, clientY } = event;
      frame = requestAnimationFrame(() => {
        const bounds = stage.getBoundingClientRect();
        const x = (clientX - bounds.left) / bounds.width - 0.5;
        const y = (clientY - bounds.top) / bounds.height - 0.5;
        stage.style.setProperty('--portrait-x', `${x * 18}px`);
        stage.style.setProperty('--portrait-y', `${y * 12}px`);
      });
    };
    stage.addEventListener('pointermove', followPointer, { passive: true });
    stage.addEventListener('pointerleave', reset);
    stage.addEventListener('pointercancel', reset);
    motion.addEventListener?.('change', reset);
    return () => {
      reset();
      stage.removeEventListener('pointermove', followPointer);
      stage.removeEventListener('pointerleave', reset);
      stage.removeEventListener('pointercancel', reset);
      motion.removeEventListener?.('change', reset);
    };
  }, []);

  return (
    <main dir="rtl" className="agouz-login agouz-login--branded">
      <div className="login-layout">
        <div className="login-identity" ref={stageRef}>
          <div className="login-brand">
            <img src="/logo.png" alt="" width="56" height="56" />
            <div>
              <span className="login-wordmark">بُن العجوز</span>
              <p>نظام الإدارة والحسابات</p>
            </div>
          </div>
          <div className="login-scene" aria-hidden="true">
            <picture className="login-art">
              <source media="(max-width: 767px)" srcSet="/roaster-welcome-small.webp" width="480" height="720" />
              <img src="/roaster-welcome.webp" alt="" width="800" height="1200" decoding="async" />
            </picture>
          </div>
        </div>
        <section className="login-panel" aria-labelledby="login-title">
          {children}
        </section>
      </div>
    </main>
  );
}
