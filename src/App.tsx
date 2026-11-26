import { canView } from "./lib/userAccess";
import React from "react";
import { WorkspaceShell } from './workspace/WorkspaceShell';
import { useWorkspaceController } from './workspace/useWorkspaceController';

const CashierUploadScreen=React.lazy(()=>import('./components/CashierUploadScreen').then(m=>({default:m.CashierUploadScreen})));

const PasswordRecoveryScreen = React.lazy(() => import('./components/PasswordRecoveryScreen').then((module)=>({default:module.PasswordRecoveryScreen})));

const LoginScreen = React.lazy(() =>
  import("./components/LoginScreen").then((module) => ({
    default: module.LoginScreen,
  })),
);

export default function App() {
  const workspace = useWorkspaceController();
  const { cloud, member, handleLogout } = workspace;

  if (!cloud.authReady)
    return (
      <div className="p-8 text-center" role="status">
        جارٍ التحقق من الجلسة…
      </div>
    );
  if (cloud.passwordRecovery) return <PasswordRecoveryScreen passwordUpdated={cloud.recoveryPasswordUpdated} onUpdatePassword={cloud.updateRecoveredPassword} onCancel={cloud.cancelPasswordRecovery} />;
  if (!member)
    return (
      <LoginScreen
        onSignIn={cloud.signIn}
        onRequestPasswordReset={cloud.requestPasswordReset}
        onResendConfirmation={cloud.resendConfirmation}
        authError={cloud.authError}
      />
    );
  if(member.role==='cashier')return <CashierUploadScreen name={member.displayName} onLogout={handleLogout}/>;
  if(!canView(member))return <main dir="rtl" className="agouz-login"><section className="login-panel p-6 space-y-4"><h1 className="font-black">الحساب غير مخوّل لعرض بيانات المحل</h1><p>اطلب من المالك تحديد صلاحياتك ثم سجّل الدخول مجددًا.</p><button className="login-submit w-full" onClick={handleLogout}>تسجيل الخروج</button></section></main>;
  return <WorkspaceShell workspace={{ ...workspace, member }} />;
}
