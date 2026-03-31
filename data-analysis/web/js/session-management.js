/**
 * Session Management module
 * Handles session CRUD operations: list, delete, rename, export, import
 */

class SessionManagementManager {
    constructor(apiClient) {
        this.apiClient = apiClient;
        this.sessions = [];
        this.selectedSession = null;
        this._listenersBound = false;
        this._refreshTimer = null;
    }

    /** Stop periodic session list refresh (e.g. when leaving the screen). */
    stopAutoRefresh() {
        if (this._refreshTimer) {
            clearInterval(this._refreshTimer);
            this._refreshTimer = null;
        }
    }

    async init() {
        this.stopAutoRefresh();
        this._refreshTimer = setInterval(() => this.loadSessionsSilent(), 10000);

        await this.loadSessions();

        if (!this._listenersBound) {
            this.setupEventListeners();
            this._listenersBound = true;
        }
    }

    setupEventListeners() {
        document.getElementById('refresh-sessions-btn').addEventListener('click', () => {
            this.loadSessions();
        });

        document.getElementById('import-session-btn').addEventListener('click', () => {
            document.getElementById('import-session-file').click();
        });

        document.getElementById('import-session-file').addEventListener('change', (e) => {
            this.handleImportFile(e.target.files[0]);
        });
    }

    /**
     * Live = last telemetry sample for this session was within the last 30 seconds (server clock).
     */
    isSessionLive(session) {
        if (!session || !session.last_telemetry_at) return false;
        const t = new Date(session.last_telemetry_at).getTime();
        if (Number.isNaN(t)) return false;
        return Date.now() - t < 30000;
    }

    async loadSessionsSilent() {
        try {
            const sessions = await this.apiClient.getSessions();
            this.sessions = Array.isArray(sessions) ? sessions : [];
            const selectedId = this.selectedSession?.session_id;
            if (selectedId) {
                const updated = this.sessions.find((s) => s.session_id === selectedId);
                this.selectedSession = updated || null;
                if (updated) {
                    this.renderSessionDetails(updated);
                } else {
                    const details = document.getElementById('session-details');
                    if (details) {
                        details.innerHTML = '<p class="no-selection">Select a session to view details</p>';
                    }
                }
            }
            this.renderSessionsList();
        } catch (error) {
            console.warn('Session list refresh failed:', error);
        }
    }

    async loadSessions() {
        try {
            const sessions = await this.apiClient.getSessions();
            this.sessions = Array.isArray(sessions) ? sessions : [];
            const selectedId = this.selectedSession?.session_id;
            if (selectedId) {
                const updated = this.sessions.find((s) => s.session_id === selectedId);
                this.selectedSession = updated || null;
                if (updated) {
                    this.renderSessionDetails(updated);
                } else {
                    const details = document.getElementById('session-details');
                    if (details) {
                        details.innerHTML = '<p class="no-selection">Select a session to view details</p>';
                    }
                }
            }
            this.renderSessionsList();
        } catch (error) {
            console.error('Error loading sessions:', error);
            alert(`Failed to load sessions: ${error.message}`);
        }
    }

    renderSessionsList() {
        const listContainer = document.getElementById('sessions-list');
        if (!listContainer) {
            console.error('sessions-list element not found in DOM');
            return;
        }
        listContainer.innerHTML = '';

        if (this.sessions.length === 0) {
            listContainer.innerHTML = '<p class="no-sessions">No sessions found</p>';
            return;
        }

        this.sessions.forEach((session) => {
            const item = document.createElement('div');
            item.className = 'session-item';
            if (this.selectedSession && this.selectedSession.session_id === session.session_id) {
                item.classList.add('selected');
            }

            const startDate = new Date(session.start_time);
            const formattedDate = startDate.toLocaleDateString() + ' ' + startDate.toLocaleTimeString();
            const deviceLabel = session.device_id ? ` • ${this.escapeHtml(session.device_id)}` : '';
            const live = this.isSessionLive(session);
            const paused = !!session.paused;

            item.innerHTML = `
                <div class="session-item-row">
                    <span class="session-live-dot ${live ? 'session-live-dot--live' : ''}"
                          title="${live ? 'Live — telemetry in the last 30 seconds' : 'Not live'}"></span>
                    <div class="session-item-info">
                        <div class="session-item-name-line">
                            <span class="session-item-name">${this.escapeHtml(session.session_id)}</span>
                            ${paused ? '<span class="session-paused-badge">Paused</span>' : ''}
                        </div>
                        <div class="session-item-meta">
                            ${formattedDate} • ${session.lap_count} laps • ${(session.total_records ?? 0).toLocaleString()} records${deviceLabel}
                        </div>
                    </div>
                </div>
            `;

            item.addEventListener('click', () => {
                this.selectSession(session);
            });

            listContainer.appendChild(item);
        });
    }

    async selectSession(session) {
        this.selectedSession = session;
        this.renderSessionsList();
        this.renderSessionDetails(session);
    }

    renderSessionDetails(session) {
        const detailsContainer = document.getElementById('session-details');

        const startDate = new Date(session.start_time);
        const endDate = session.end_time ? new Date(session.end_time) : null;
        const duration = endDate ? Math.round((endDate - startDate) / 1000 / 60) : null;
        const live = this.isSessionLive(session);
        const paused = !!session.paused;

        detailsContainer.innerHTML = `
            <div class="session-details-content">
                <h2>${this.escapeHtml(session.session_id)}</h2>
                
                <div class="session-details-section">
                    <h3>Session Information</h3>
                    <div class="detail-row">
                        <span class="detail-label">Status:</span>
                        <span class="detail-value">
                            ${live ? '<span class="session-status-live">Live</span>' : '<span class="session-status-idle">Idle</span>'}
                            ${paused ? ' · <span class="session-status-paused-text">ingestion paused (data discarded)</span>' : ''}
                        </span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Start Time:</span>
                        <span class="detail-value">${startDate.toLocaleString()}</span>
                    </div>
                    ${endDate ? `
                    <div class="detail-row">
                        <span class="detail-label">End Time:</span>
                        <span class="detail-value">${endDate.toLocaleString()}</span>
                    </div>
                    ` : ''}
                    ${duration !== null ? `
                    <div class="detail-row">
                        <span class="detail-label">Duration:</span>
                        <span class="detail-value">${duration} minutes</span>
                    </div>
                    ` : ''}
                    <div class="detail-row">
                        <span class="detail-label">Laps:</span>
                        <span class="detail-value">${session.lap_count}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Total Records:</span>
                        <span class="detail-value">${(session.total_records ?? 0).toLocaleString()}</span>
                    </div>
                    ${session.device_id ? `
                    <div class="detail-row">
                        <span class="detail-label">Device:</span>
                        <span class="detail-value">${this.escapeHtml(session.device_id)}</span>
                    </div>
                    ` : ''}
                </div>

                <div class="session-details-section session-setup-section">
                    <h3>Car setup log</h3>
                    <p class="session-setup-hint">Record tire pressures, ride heights, dampers, aero, and other changes. Each entry stores a JSON object and optional notes.</p>
                    <div id="session-setup-events-list" class="session-setup-events-list"></div>
                    <div class="session-setup-add">
                        <h4>Add setup entry</h4>
                        <label for="session-setup-json">Setup (JSON object)</label>
                        <textarea id="session-setup-json" class="session-setup-json" rows="6"
                            placeholder='Example: { "tire_pressure_psi": { "fl": 22, "fr": 22, "rl": 20, "rr": 20 } }'></textarea>
                        <label for="session-setup-notes">Notes (optional)</label>
                        <input type="text" id="session-setup-notes" class="session-setup-notes-input" maxlength="10000" autocomplete="off" />
                        <label for="session-setup-recorded-at">Event time (optional, local)</label>
                        <input type="datetime-local" id="session-setup-recorded-at" class="session-setup-datetime" />
                        <div class="session-setup-form-actions">
                            <button type="button" class="btn-primary" id="session-setup-submit-btn">Log setup</button>
                        </div>
                        <p id="session-setup-form-error" class="session-setup-form-error" style="display: none;" role="alert"></p>
                    </div>
                </div>

                <div class="session-details-actions">
                    <button type="button" class="btn-secondary" id="pause-session-btn">${paused ? 'Resume ingestion' : 'Pause session'}</button>
                    <button type="button" class="btn-primary" id="rename-session-btn">Rename</button>
                    <button type="button" class="btn-primary" id="export-session-btn">Export</button>
                    <button type="button" class="btn-danger" id="delete-session-btn">Delete</button>
                </div>
                <p class="session-pause-hint">Pausing does not stop the in-car unit; the server simply discards incoming telemetry until you resume.</p>
            </div>
        `;

        document.getElementById('pause-session-btn').addEventListener('click', () => {
            this.toggleSessionPause(session);
        });

        document.getElementById('rename-session-btn').addEventListener('click', () => {
            this.showRenameDialog(session);
        });

        document.getElementById('export-session-btn').addEventListener('click', () => {
            this.exportSession(session);
        });

        document.getElementById('delete-session-btn').addEventListener('click', () => {
            this.showDeleteConfirm(session);
        });

        this.bindSessionSetupPanel(session);
    }

    bindSessionSetupPanel(session) {
        const submitBtn = document.getElementById('session-setup-submit-btn');
        const errEl = document.getElementById('session-setup-form-error');
        const showErr = (msg) => {
            if (!errEl) return;
            errEl.textContent = msg || '';
            errEl.style.display = msg ? 'block' : 'none';
        };

        this.refreshSessionSetupEvents(session.session_id).catch((e) => {
            console.warn('Setup events:', e);
            const listEl = document.getElementById('session-setup-events-list');
            if (listEl) {
                listEl.innerHTML = `<p class="session-setup-error">Could not load setup log: ${this.escapeHtml(e.message)}</p>`;
            }
        });

        if (submitBtn) {
            submitBtn.onclick = async () => {
                showErr('');
                const raw = document.getElementById('session-setup-json')?.value?.trim() || '';
                let setup = {};
                if (raw) {
                    try {
                        setup = JSON.parse(raw);
                        if (setup === null || typeof setup !== 'object' || Array.isArray(setup)) {
                            showErr('Setup must be a JSON object (e.g. { "key": value }), not an array or primitive.');
                            return;
                        }
                    } catch (_) {
                        showErr('Invalid JSON in setup field.');
                        return;
                    }
                }
                const notes = document.getElementById('session-setup-notes')?.value?.trim() || null;
                const dtLocal = document.getElementById('session-setup-recorded-at')?.value;
                const payload = { setup, source: 'analyst_ui' };
                if (notes) payload.notes = notes;
                if (dtLocal) {
                    const d = new Date(dtLocal);
                    if (!Number.isNaN(d.getTime())) {
                        payload.recorded_at = d.toISOString();
                    }
                }
                submitBtn.disabled = true;
                try {
                    await this.apiClient.addSessionSetupEvent(session.session_id, payload);
                    document.getElementById('session-setup-json').value = '';
                    document.getElementById('session-setup-notes').value = '';
                    document.getElementById('session-setup-recorded-at').value = '';
                    await this.refreshSessionSetupEvents(session.session_id);
                } catch (e) {
                    showErr(e.message || 'Failed to save setup entry');
                } finally {
                    submitBtn.disabled = false;
                }
            };
        }
    }

    async refreshSessionSetupEvents(sessionId) {
        const listEl = document.getElementById('session-setup-events-list');
        if (!listEl) return;
        listEl.innerHTML = '<p class="session-setup-loading">Loading…</p>';
        const data = await this.apiClient.getSessionSetupEvents(sessionId);
        const events = data.events || [];
        if (events.length === 0) {
            listEl.innerHTML = '<p class="session-setup-empty">No setup entries yet.</p>';
            return;
        }
        listEl.innerHTML = events.map((ev) => this.renderSetupEventRow(ev)).join('');
        listEl.querySelectorAll('[data-setup-delete]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = parseInt(btn.getAttribute('data-setup-delete'), 10);
                if (!Number.isFinite(id)) return;
                if (!confirm('Delete this setup entry?')) return;
                try {
                    await this.apiClient.deleteSessionSetupEvent(sessionId, id);
                    await this.refreshSessionSetupEvents(sessionId);
                } catch (e) {
                    alert(e.message || 'Delete failed');
                }
            });
        });
    }

    renderSetupEventRow(ev) {
        const when = ev.recorded_at ? new Date(ev.recorded_at).toLocaleString() : '—';
        const who = ev.created_by ? this.escapeHtml(ev.created_by) : '—';
        const notes = ev.notes ? `<div class="session-setup-event-notes">${this.escapeHtml(ev.notes)}</div>` : '';
        const jsonStr = JSON.stringify(ev.setup || {}, null, 2);
        return `
            <div class="session-setup-event" data-setup-id="${ev.id}">
                <div class="session-setup-event-header">
                    <span class="session-setup-event-time">${this.escapeHtml(when)}</span>
                    <span class="session-setup-event-meta">${who} · ${this.escapeHtml(ev.source || '')}</span>
                    <button type="button" class="btn-small btn-danger session-setup-delete" data-setup-delete="${ev.id}" title="Delete entry">Delete</button>
                </div>
                ${notes}
                <pre class="session-setup-event-json">${this.escapeHtml(jsonStr)}</pre>
            </div>
        `;
    }

    async toggleSessionPause(session) {
        const sid = session.session_id;
        try {
            await this.apiClient.setSessionPaused(sid, !session.paused);
            await this.loadSessions();
            const updated = this.sessions.find((s) => s.session_id === sid);
            if (updated) {
                this.selectSession(updated);
            }
        } catch (error) {
            alert(`Failed to update session: ${error.message}`);
        }
    }

    showRenameDialog(session) {
        const newName = prompt(`Rename session "${session.session_id}" to:`, session.session_id);
        if (newName && newName.trim() && newName !== session.session_id) {
            this.renameSession(session, newName.trim());
        }
    }

    async renameSession(session, newSessionId) {
        try {
            await this.apiClient.renameSession(session.session_id, newSessionId);
            await this.loadSessions();
            const renamedSession = this.sessions.find((s) => s.session_id === newSessionId);
            if (renamedSession) {
                this.selectSession(renamedSession);
            }
        } catch (error) {
            alert(`Failed to rename session: ${error.message}`);
        }
    }

    async exportSession(session) {
        try {
            const data = await this.apiClient.exportSession(session.session_id);

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `session_${session.session_id}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            alert(`Failed to export session: ${error.message}`);
        }
    }

    showDeleteConfirm(session) {
        if (confirm(`Are you sure you want to delete session "${session.session_id}"?\n\nThis will delete ${session.total_records.toLocaleString()} records and cannot be undone.`)) {
            this.deleteSession(session);
        }
    }

    async deleteSession(session) {
        try {
            await this.apiClient.deleteSession(session.session_id);
            this.selectedSession = null;
            await this.loadSessions();
            document.getElementById('session-details').innerHTML = '<p class="no-selection">Select a session to view details</p>';
        } catch (error) {
            alert(`Failed to delete session: ${error.message}`);
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async handleImportFile(file) {
        if (!file) return;

        if (!file.name.endsWith('.json')) {
            alert('Please select a JSON file');
            return;
        }

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            if (!Array.isArray(data)) {
                alert('Invalid file format. Expected an array of telemetry records.');
                return;
            }

            if (data.length === 0) {
                alert('File is empty');
                return;
            }

            if (!confirm(`Import ${data.length.toLocaleString()} telemetry records?`)) {
                return;
            }

            const importBtn = document.getElementById('import-session-btn');
            const originalText = importBtn.textContent;
            importBtn.disabled = true;
            importBtn.textContent = 'Importing...';

            const result = await this.apiClient.importSession(data);

            importBtn.disabled = false;
            importBtn.textContent = originalText;

            if (result.errors && result.errors.length > 0) {
                alert(`Import completed with ${result.errors.length} errors.\n\nImported: ${result.imported_count.toLocaleString()} records`);
            } else {
                alert(`Successfully imported ${result.imported_count.toLocaleString()} records`);
            }

            document.getElementById('import-session-file').value = '';

            await this.loadSessions();
        } catch (error) {
            alert(`Failed to import session: ${error.message}`);
            document.getElementById('import-session-btn').disabled = false;
            document.getElementById('import-session-btn').textContent = 'Import Session';
        }
    }
}
