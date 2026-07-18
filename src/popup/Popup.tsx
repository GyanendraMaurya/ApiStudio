import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/styles.css';
import { MESSAGE_TYPES, type RuntimeResponse } from '../shared/messages';
import type { InterceptionState } from '../shared/types';

interface ActiveTabInfo {
  id: number;
  url?: string;
  title?: string;
}

function Popup() {
  const [tab, setTab] = useState<ActiveTabInfo>();
  const [state, setState] = useState<InterceptionState>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void load();
  }, []);

  const enabled = Boolean(state?.enabled && state.attached);
  const hostname = useMemo(() => {
    if (!tab?.url) {
      return 'No active website';
    }

    try {
      return new URL(tab.url).hostname;
    } catch {
      return tab.url;
    }
  }, [tab?.url]);

  async function load() {
    setError(undefined);
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) {
      setError('No active tab is available.');
      return;
    }

    const nextTab = { id: activeTab.id, url: activeTab.url, title: activeTab.title };
    setTab(nextTab);

    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.GET_TAB_STATE,
      tabId: activeTab.id
    }) as RuntimeResponse<InterceptionState | undefined>;

    if (response.ok) {
      setState(response.data);
    } else {
      setError(response.error);
    }
  }

  async function toggle() {
    if (!tab) {
      return;
    }

    setBusy(true);
    setError(undefined);

    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.SET_TAB_INTERCEPTION,
      tabId: tab.id,
      enabled: !enabled,
      url: tab.url
    }) as RuntimeResponse<InterceptionState>;

    setBusy(false);

    if (response.ok) {
      setState(response.data);
    } else {
      setError(response.error);
    }
  }

  function openOptions() {
    void chrome.runtime.openOptionsPage();
  }

  function openStudio() {
    void chrome.tabs.create({ url: chrome.runtime.getURL('studio.html') });
  }

  return (
    <main className="popup-shell stack">
      <section className="brand">
        <h1>API Studio</h1>
        <span>{hostname}</span>
      </section>

      <div className={error ? 'status error' : 'status'}>
        {error ? error : enabled ? 'Interception is enabled for this tab.' : 'Interception is disabled for this tab.'}
      </div>

      <section className="panel">
        <div className="panel-body stack">
          <div>
            <div className="muted">Current tab</div>
            <strong className="popup-title">{tab?.title ?? 'Untitled tab'}</strong>
          </div>
          <div className="muted popup-url">{tab?.url ?? 'Open a website tab to begin.'}</div>
          <button className={`btn ${enabled ? 'danger' : 'primary'}`} disabled={!tab || busy} onClick={toggle}>
            {busy ? 'Working...' : enabled ? 'Disable interception' : 'Enable interception'}
          </button>
          <button className="btn ghost" onClick={openStudio}>Open Studio</button>
          <button className="btn ghost" onClick={openOptions}>Open rules</button>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Popup />);
