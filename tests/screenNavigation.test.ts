// @vitest-environment jsdom
import { createElement, Suspense } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import {
  buildNavigationUrl,
  readNavigationFromWindow,
} from '../src/lib/screenNavigation';

vi.mock('../src/lib/supabaseSync', () => ({
  getSupabaseClient: () => null,
  getSupabaseCredentials: () => ({ url: '', anonKey: '' }),
}));

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('screenNavigation', () => {
  it('defaults to home and menu when URL and history state are empty', () => {
    expect(readNavigationFromWindow()).toEqual({ screen: 'home', tab: 'menu' });
    expect(buildNavigationUrl('home', 'menu')).toBe('/');
  });

  it('builds and reads screen and sub-tab query parameters while preserving hashes', () => {
    window.history.replaceState(null, '', '/?screen=more&tab=expenses#section');
    expect(readNavigationFromWindow()).toEqual({
      screen: 'more',
      tab: 'expenses',
    });
    expect(buildNavigationUrl('purchase', 'menu')).toBe(
      '/?screen=purchase#section',
    );
    expect(buildNavigationUrl('home', 'menu')).toBe('/#section');
  });

  it('falls back safely to home and menu on unknown screen or tab values', () => {
    window.history.replaceState(
      { screen: 'unknown_screen', tab: 'unknown_tab' },
      '',
      '/?screen=unknown',
    );
    expect(readNavigationFromWindow()).toEqual({ screen: 'home', tab: 'menu' });
  });

  it('preserves the linked sub-tab when the app opens before sign-in', async () => {
    window.history.replaceState(null, '', '/?screen=more&tab=expenses');
    render(createElement(Suspense, {fallback: null}, createElement(App)));
    await screen.findByRole('button', {name: 'تسجيل الدخول', exact: true});
    expect(window.location.search).toBe('?screen=more&tab=expenses');
    expect(window.history.state).toEqual({screen: 'more', tab: 'expenses'});
  });
});
