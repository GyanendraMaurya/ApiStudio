import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/styles.css';
import { createRuleFromLog } from '../services/RuleFactory';
import { StorageService } from '../services/StorageService';
import type { RequestLogEntry, StudioSettings } from '../shared/types';

const storage = new StorageService();

type ResultFilter = 'all' | RequestLogEntry['result'];
const RULE_NOTICE_DURATION_MS = 3500;

interface CreatedRuleNotice {
  ruleId: string;
  ruleName: string;
  createdAt: number;
}

function Studio() {
  const [logs, setLogs] = useState<RequestLogEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [search, setSearch] = useState('');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [createdRuleNotice, setCreatedRuleNotice] = useState<CreatedRuleNotice>();
  const [settings, setSettings] = useState<StudioSettings>({ discoverEnabled: false });
  const noticeTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    void load();

    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName === 'local' && changes.logs) {
        const nextLogs = changes.logs.newValue ?? [];
        setLogs(nextLogs);
        setSelectedId((current) => current ?? nextLogs[0]?.id);
      }
      if (areaName === 'local' && changes.studioSettings) {
        setSettings(changes.studioSettings.newValue ?? { discoverEnabled: false });
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => {
      chrome.storage.onChanged.removeListener(listener);
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  const filteredLogs = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return logs.filter((log) => {
      const matchesSearch = !normalizedSearch || `${log.method} ${log.url} ${log.ruleName ?? ''}`.toLowerCase().includes(normalizedSearch);
      const matchesResult = resultFilter === 'all' || log.result === resultFilter;
      return matchesSearch && matchesResult;
    });
  }, [logs, resultFilter, search]);

  const selectedLog = useMemo(() => {
    return logs.find((log) => log.id === selectedId) ?? filteredLogs[0];
  }, [filteredLogs, logs, selectedId]);

  async function load() {
    const snapshot = await storage.getSnapshot();
    setLogs(snapshot.logs);
    setSettings(snapshot.studioSettings);
    setSelectedId(snapshot.logs[0]?.id);
  }

  async function clearLogs() {
    await storage.clearLogs();
    setLogs([]);
    setSelectedId(undefined);
  }

  async function createRule(log: RequestLogEntry) {
    const rule = createRuleFromLog(log);
    await storage.upsertRule(rule);
    setCreatedRuleNotice({
      ruleId: rule.id,
      ruleName: rule.name,
      createdAt: Date.now()
    });

    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current);
    }

    noticeTimerRef.current = window.setTimeout(() => {
      setCreatedRuleNotice(undefined);
      noticeTimerRef.current = undefined;
    }, RULE_NOTICE_DURATION_MS);
  }

  function openOptions() {
    void chrome.runtime.openOptionsPage();
  }

  async function toggleDiscover() {
    const nextSettings = await storage.setDiscoverEnabled(!settings.discoverEnabled);
    setSettings(nextSettings);
  }

  function openCreatedRule(ruleId: string) {
    void chrome.tabs.create({ url: chrome.runtime.getURL(`options.html?ruleId=${encodeURIComponent(ruleId)}`) });
  }

  return (
    <main className="studio-shell">
      <header className="topbar">
        <div className="brand">
          <h1>API Studio</h1>
          <span>Request inspector</span>
        </div>
        <div className="inline">
          <button className="btn" onClick={openOptions}>Rules</button>
          <button className="btn ghost inverse" onClick={clearLogs}>Clear log</button>
        </div>
      </header>

      {createdRuleNotice && (
        <section className="rule-created-toast" key={createdRuleNotice.createdAt}>
          <div>
            <strong>Rule created</strong>
            <span>{createdRuleNotice.ruleName}</span>
          </div>
          <button className="btn primary" onClick={() => openCreatedRule(createdRuleNotice.ruleId)}>Open rule</button>
          <span className="toast-timer" style={{ animationDuration: `${RULE_NOTICE_DURATION_MS}ms` }}></span>
        </section>
      )}

      <section className="studio-toolbar">
        <div className="field">
          <label>Search</label>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter by URL, method, or rule" />
        </div>
        <div className="field">
          <label>Result</label>
          <select value={resultFilter} onChange={(event) => setResultFilter(event.target.value as ResultFilter)}>
            <option value="all">All</option>
            <option value="continued">Continued</option>
            <option value="fulfilled">Fulfilled</option>
            <option value="blocked">Blocked</option>
            <option value="discovered">Discovered</option>
            <option value="error">Error</option>
          </select>
        </div>
      </section>

      <section className={`discover-strip ${settings.discoverEnabled ? 'active' : ''}`}>
        <div>
          <strong>Discover requests</strong>
          <span>{settings.discoverEnabled ? 'Capturing unmatched Fetch/XHR responses so you can create rules from real traffic.' : 'Off by default. Turn it on briefly when you want to find an API call and create a rule from it.'}</span>
        </div>
        <button className={`btn ${settings.discoverEnabled ? 'danger' : 'primary'}`} onClick={toggleDiscover}>
          {settings.discoverEnabled ? 'Turn off' : 'Turn on'}
        </button>
      </section>

      <section className="studio-grid">
        <RequestTimeline logs={filteredLogs} selectedId={selectedLog?.id} onSelect={setSelectedId} />
        <RequestDetails log={selectedLog} onCreateRule={createRule} />
      </section>
    </main>
  );
}

function RequestTimeline({
  logs,
  selectedId,
  onSelect
}: {
  logs: RequestLogEntry[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="panel timeline-panel">
      <div className="panel-header">
        <h2>Timeline</h2>
        <span className="pill">{logs.length}</span>
      </div>
      <div className="timeline-list">
        {logs.length === 0 && <div className="empty-state">No requests yet. Enable interception from the popup and use a site that calls an API.</div>}
        {logs.map((log) => (
          <button className={`timeline-row ${log.id === selectedId ? 'selected' : ''}`} key={log.id} onClick={() => onSelect(log.id)}>
            <span className="method-badge">{log.method}</span>
            <span className={`result-dot ${log.result}`}></span>
            <span className="timeline-main">
              <strong>{formatUrl(log.url)}</strong>
              <small>{timelineLabel(log)} · {formatTime(log.createdAt)}</small>
            </span>
            <span className="timeline-meta">
              {log.statusCode ?? '-'}
              {typeof log.durationMs === 'number' && <small>{log.durationMs}ms</small>}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function RequestDetails({
  log,
  onCreateRule
}: {
  log?: RequestLogEntry;
  onCreateRule: (log: RequestLogEntry) => void;
}) {
  if (!log) {
    return (
      <section className="panel details-panel">
        <div className="empty-state">Select a request to inspect it.</div>
      </section>
    );
  }

  return (
    <section className="panel details-panel">
      <div className="panel-header">
        <h2>Request details</h2>
        <button className="btn primary" onClick={() => onCreateRule(log)}>Create rule</button>
      </div>
      <div className="details-body">
        <div className="detail-grid">
          <Detail label="Method" value={log.method} />
          <Detail label="Result" value={log.error ?? readableResult(log.result)} />
          <Detail label="Status" value={log.statusCode?.toString() ?? '-'} />
          <Detail label="Duration" value={typeof log.durationMs === 'number' ? `${log.durationMs}ms` : '-'} />
          <Detail label="Rule" value={log.ruleName ?? (log.result === 'discovered' ? 'Discovered request' : '-')} />
          <Detail label="Action" value={log.actionType ?? '-'} />
        </div>

        <div className="field">
          <label>URL</label>
          <div className="code-box">{log.url}</div>
        </div>

        <div className="field">
          <label>{log.modifiedResponsePreview ? 'Modified response preview' : 'Response preview'}</label>
          <pre className="preview-box">{log.modifiedResponsePreview ?? log.responseBodyPreview ?? 'No response preview stored for this request.'}</pre>
        </div>

        {log.originalResponsePreview && log.modifiedResponsePreview && (
          <div className="field">
            <label>Original response preview</label>
            <pre className="preview-box compact">{log.originalResponsePreview}</pre>
          </div>
        )}
      </div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatTime(value: number): string {
  return new Date(value).toLocaleTimeString();
}

function formatUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}${url.search}`;
  } catch {
    return value;
  }
}

function timelineLabel(log: RequestLogEntry): string {
  if (log.ruleName) {
    return log.ruleName;
  }
  if (log.result === 'discovered') {
    return 'Discovered';
  }
  return 'No rule';
}

function readableResult(result: RequestLogEntry['result']): string {
  if (result === 'discovered') {
    return 'discovered';
  }
  return result;
}

createRoot(document.getElementById('root')!).render(<Studio />);
