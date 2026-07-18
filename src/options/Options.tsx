import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/styles.css';
import { StorageService } from '../services/StorageService';
import { createId } from '../shared/base64';
import type { ApiRule, HttpMethod, RequestLogEntry, RuleActionType, UrlMatchType } from '../shared/types';

const storage = new StorageService();
const METHODS: HttpMethod[] = ['ANY', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const ACTIONS: RuleActionType[] = ['replaceBody', 'modifyJson', 'customStatus', 'delay', 'block'];

function createBlankRule(): ApiRule {
  const now = Date.now();
  return {
    id: createId('rule'),
    name: 'New rule',
    enabled: true,
    match: {
      urlType: 'contains',
      urlValue: '',
      method: 'ANY'
    },
    action: {
      type: 'replaceBody',
      responseBody: '{\n  "ok": true\n}',
      statusCode: 200,
      delayMs: 0,
      transformCode: 'return input;'
    },
    createdAt: now,
    updatedAt: now
  };
}

function Options() {
  const [rules, setRules] = useState<ApiRule[]>([]);
  const [logs, setLogs] = useState<RequestLogEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [draft, setDraft] = useState<ApiRule>(createBlankRule);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    void load();

    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== 'local') {
        return;
      }
      if (changes.rules) {
        setRules(changes.rules.newValue ?? []);
      }
      if (changes.logs) {
        setLogs(changes.logs.newValue ?? []);
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const selectedRule = useMemo(() => rules.find((rule) => rule.id === selectedId), [rules, selectedId]);

  async function load() {
    const snapshot = await storage.getSnapshot();
    setRules(snapshot.rules);
    setLogs(snapshot.logs);
    if (snapshot.rules[0]) {
      setSelectedId(snapshot.rules[0].id);
      setDraft(snapshot.rules[0]);
    }
  }

  function selectRule(rule: ApiRule) {
    setSelectedId(rule.id);
    setDraft(rule);
    setErrors([]);
  }

  function startNewRule() {
    const next = createBlankRule();
    setSelectedId(undefined);
    setDraft(next);
    setErrors([]);
  }

  async function saveRule() {
    const validationErrors = validateRule(draft);
    setErrors(validationErrors);

    if (validationErrors.length > 0) {
      return;
    }

    const now = Date.now();
    const rule = {
      ...draft,
      updatedAt: now,
      createdAt: selectedRule?.createdAt ?? draft.createdAt
    };
    const nextRules = await storage.upsertRule(rule);
    setRules(nextRules);
    setSelectedId(rule.id);
    setDraft(rule);
  }

  async function deleteRule(ruleId: string) {
    const nextRules = await storage.deleteRule(ruleId);
    setRules(nextRules);
    const nextSelected = nextRules[0];
    setSelectedId(nextSelected?.id);
    setDraft(nextSelected ?? createBlankRule());
  }

  async function toggleRule(rule: ApiRule) {
    const nextRule = { ...rule, enabled: !rule.enabled, updatedAt: Date.now() };
    const nextRules = await storage.upsertRule(nextRule);
    setRules(nextRules);
    if (draft.id === rule.id) {
      setDraft(nextRule);
    }
  }

  async function clearLogs() {
    await storage.clearLogs();
    setLogs([]);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1>API Studio</h1>
          <span>Rules, response transforms, and request activity</span>
        </div>
        <button className="btn" onClick={startNewRule}>New rule</button>
      </header>

      <section className="layout">
        <aside className="panel">
          <div className="panel-header">
            <h2>Rules</h2>
            <span className="pill">{rules.length}</span>
          </div>
          <div className="panel-body rule-list">
            {rules.length === 0 && <div className="muted">No rules yet. Create one to intercept matching responses.</div>}
            {rules.map((rule) => (
              <article className={`rule-row ${rule.id === draft.id ? 'active' : ''}`} key={rule.id}>
                <div className="rule-title">
                  <span>{rule.name}</span>
                  <span className="pill">{rule.enabled ? 'On' : 'Off'}</span>
                </div>
                <div className="muted">{rule.match.method} · {rule.match.urlType} · {rule.action.type}</div>
                <div className="inline">
                  <button className="btn ghost" onClick={() => selectRule(rule)}>Edit</button>
                  <button className="btn ghost" onClick={() => toggleRule(rule)}>{rule.enabled ? 'Disable' : 'Enable'}</button>
                  <button className="btn danger" onClick={() => deleteRule(rule.id)}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        </aside>

        <section className="stack">
          <RuleEditor draft={draft} setDraft={setDraft} errors={errors} onSave={saveRule} />
          <RequestLog logs={logs} onClear={clearLogs} />
        </section>
      </section>
    </main>
  );
}

interface RuleEditorProps {
  draft: ApiRule;
  setDraft: (rule: ApiRule) => void;
  errors: string[];
  onSave: () => void;
}

function RuleEditor({ draft, setDraft, errors, onSave }: RuleEditorProps) {
  function update(next: Partial<ApiRule>) {
    setDraft({ ...draft, ...next });
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Rule editor</h2>
        <label className="inline muted">
          <input type="checkbox" checked={draft.enabled} onChange={(event) => update({ enabled: event.target.checked })} />
          Enabled
        </label>
      </div>
      <div className="panel-body stack">
        {errors.length > 0 && (
          <ul className="error-list">
            {errors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        )}

        <div className="field">
          <label>Name</label>
          <input value={draft.name} onChange={(event) => update({ name: event.target.value })} />
        </div>

        <div className="split">
          <div className="field">
            <label>URL match</label>
            <select
              value={draft.match.urlType}
              onChange={(event) => update({ match: { ...draft.match, urlType: event.target.value as UrlMatchType } })}
            >
              <option value="exact">Exact</option>
              <option value="contains">Contains</option>
              <option value="regex">Regex</option>
            </select>
          </div>
          <div className="field">
            <label>Method</label>
            <select
              value={draft.match.method}
              onChange={(event) => update({ match: { ...draft.match, method: event.target.value as HttpMethod } })}
            >
              {METHODS.map((method) => <option value={method} key={method}>{method}</option>)}
            </select>
          </div>
        </div>

        <div className="field">
          <label>URL value</label>
          <input
            value={draft.match.urlValue}
            placeholder="https://api.example.com/users or /users"
            onChange={(event) => update({ match: { ...draft.match, urlValue: event.target.value } })}
          />
        </div>

        <div className="split">
          <div className="field">
            <label>Action</label>
            <select
              value={draft.action.type}
              onChange={(event) => update({ action: { ...draft.action, type: event.target.value as RuleActionType } })}
            >
              {ACTIONS.map((action) => <option value={action} key={action}>{action}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Status code</label>
            <input
              type="number"
              min="100"
              max="599"
              value={draft.action.statusCode ?? 200}
              onChange={(event) => update({ action: { ...draft.action, statusCode: Number(event.target.value) } })}
            />
          </div>
        </div>

        <div className="field">
          <label>Delay milliseconds</label>
          <input
            type="number"
            min="0"
            value={draft.action.delayMs ?? 0}
            onChange={(event) => update({ action: { ...draft.action, delayMs: Number(event.target.value) } })}
          />
        </div>

        {(draft.action.type === 'replaceBody' || draft.action.type === 'customStatus') && (
          <div className="field">
            <label>Response body</label>
            <textarea
              value={draft.action.responseBody ?? ''}
              onChange={(event) => update({ action: { ...draft.action, responseBody: event.target.value } })}
            />
          </div>
        )}

        {draft.action.type === 'modifyJson' && (
          <div className="field">
            <label>Transform JavaScript</label>
            <textarea
              value={draft.action.transformCode ?? 'return input;'}
              onChange={(event) => update({ action: { ...draft.action, transformCode: event.target.value } })}
            />
          </div>
        )}

        <button className="btn primary" onClick={onSave}>Save rule</button>
      </div>
    </section>
  );
}

function RequestLog({ logs, onClear }: { logs: RequestLogEntry[]; onClear: () => void }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Request log</h2>
        <button className="btn ghost" onClick={onClear}>Clear</button>
      </div>
      <div className="panel-body">
        {logs.length === 0 ? (
          <div className="muted">Matched requests and errors will appear here.</div>
        ) : (
          <table className="log-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Method</th>
                <th>Result</th>
                <th>Rule</th>
                <th>URL</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.createdAt).toLocaleTimeString()}</td>
                  <td>{log.method}</td>
                  <td>{log.error ?? log.result}</td>
                  <td>{log.ruleName ?? '-'}</td>
                  <td className="url-cell">{log.url}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function validateRule(rule: ApiRule): string[] {
  const errors: string[] = [];
  if (!rule.name.trim()) {
    errors.push('Rule name is required.');
  }
  if (!rule.match.urlValue.trim()) {
    errors.push('URL value is required.');
  }
  if (rule.match.urlType === 'regex') {
    try {
      new RegExp(rule.match.urlValue);
    } catch (error) {
      errors.push(`Regex is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (rule.action.statusCode !== undefined && (rule.action.statusCode < 100 || rule.action.statusCode > 599)) {
    errors.push('Status code must be between 100 and 599.');
  }
  if ((rule.action.delayMs ?? 0) < 0) {
    errors.push('Delay must be zero or greater.');
  }
  if (rule.action.type === 'modifyJson' && !rule.action.transformCode?.trim()) {
    errors.push('Transform JavaScript is required.');
  }
  return errors;
}

createRoot(document.getElementById('root')!).render(<Options />);
