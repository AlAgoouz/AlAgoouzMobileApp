import React from 'react';

export function AuthenticationLayout({ children }: { children: React.ReactNode }) {
  return (
    <main dir="rtl" className="agouz-login agouz-login--branded">
      <div className="login-layout">
        <div className="login-identity">
          <div className="login-brand">
            <img src="/logo.png" alt="" width="56" height="56" />
            <div>
              <span className="login-wordmark">بُن العجوز</span>
              <p>نظام الإدارة والحسابات</p>
            </div>
          </div>
          <div className="login-scene" aria-hidden="true">
            <picture className="login-art">
              <source media="(max-width: 767px)" srcSet="/roaster-cutout-small.webp" width="480" height="720" />
              <img src="/roaster-cutout.webp" alt="" width="800" height="1200" decoding="async" />
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
