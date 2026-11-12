import {useEffect, useState} from 'react';
import {buildNavigationUrl, readNavigationFromWindow, type MoreSubTab} from '../lib/screenNavigation';

export function useWorkspaceNavigation() {
  const [activeScreen, setActiveScreen] = useState(() => readNavigationFromWindow().screen);
  const [moreInitialTab, setMoreInitialTab] = useState<MoreSubTab>(() => readNavigationFromWindow().tab);

  useEffect(() => {
    function onPopState() {
      const next = readNavigationFromWindow();
      setMoreInitialTab(next.tab);
      setActiveScreen(next.screen);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const current = readNavigationFromWindow();
    const nextUrl = buildNavigationUrl(activeScreen, moreInitialTab);
    const nextState = {screen: activeScreen, tab: moreInitialTab};
    if (current.screen === activeScreen && current.tab === moreInitialTab) {
      if (!window.history.state) window.history.replaceState(nextState, '', nextUrl);
    } else {
      window.history.pushState(nextState, '', nextUrl);
    }
  }, [activeScreen, moreInitialTab]);

  return {activeScreen, setActiveScreen, moreInitialTab, setMoreInitialTab};
}
