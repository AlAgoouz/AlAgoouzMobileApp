import React from 'react';

export function AuthenticationLayout({ children }: { children: React.ReactNode }) {
  return (
    <main dir="rtl" className="agouz-login agouz-login--branded">
      <div className="login-layout">
        <section className="login-panel" aria-labelledby="login-title">
          <header className="login-brand">
            <img src="/logo.png" alt="" width="52" height="52" />
            <div>
              <span className="login-wordmark">بُن العجوز</span>
              <p>نظام الإدارة والحسابات</p>
            </div>
          </header>
          {children}
        </section>
        <div className="login-scene" aria-hidden="true">
          <picture className="login-art">
            <source media="(max-width: 767px)" srcSet="/roaster-portrait-small.webp" width="480" height="720" />
            <img src="/roaster-portrait.webp" alt="" width="800" height="1200" decoding="async" />
          </picture>
        </div>
      </div>
    </main>
  );
}
