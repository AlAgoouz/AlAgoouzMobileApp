import './styles/tokens.css';
import './index.css';
import './styles/layout-shell.css';
import './styles/components.css';

const screen = window.location.pathname.replace(/\/$/, '') === '/menu'
  ? import('./components/PublicMenuPage')
  : import('./App');

// The selected route and the renderer load in parallel. The error boundary
// receives the same route promise even if it rejected before React mounted.
void screen.catch(() => undefined);
void import('./main').then(({ mountScreen }) => mountScreen(screen)).catch(() => {
  const root = document.getElementById('root');
  if (!root) return;
  const message = document.createElement('p');
  message.setAttribute('role', 'alert');
  message.textContent = 'تعذّر تحميل التطبيق. أعد تحميل الصفحة للمحاولة مرة أخرى.';
  root.replaceChildren(message);
});
