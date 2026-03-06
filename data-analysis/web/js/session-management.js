/**
 * Session Management module
 * Handles session CRUD operations: list, delete, rename, export, import
 */

class SessionManagementManager {
    constructor(apiClient) {
        this.apiClient = apiClient;
        this.sessions = [];
        this.selectedSession = null;
    }

    async init() {
        await this.loadSessions();
        this.setupEventListeners();
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

    async loadSessions() {
        try {
            // getSessions() returns an array directly (extracted from API response)
            const sessions = await this.apiClient.getSessions();
            this.sessions = Array.isArray(sessions) ? sessions : [];
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

        this.sessions.forEach(session => {
            const item = document.createElement('div');
            item.className = 'session-item';
            if (this.selectedSession && this.selectedSession.session_id === session.session_id) {
                item.classList.add('selected');
            }

            const startDate = new Date(session.start_time);
            const formattedDate = startDate.toLocaleDateString() + ' ' + startDate.toLocaleTimeString();

            item.innerHTML = `
                <div class="session-item-info">
                    <div class="session-item-name">${session.session_id}</div>
                    <div class="session-item-meta">
                        ${formattedDate} • ${session.lap_count} laps • ${session.total_records.toLocaleString()} records
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

        detailsContainer.innerHTML = `
            <div class="session-details-content">
                <h2>${session.session_id}</h2>
                
                <div class="session-details-section">
                    <h3>Session Information</h3>
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
                        <span class="detail-value">${session.total_records.toLocaleString()}</span>
                    </div>
                </div>

                <div class="session-details-actions">
                    <button class="btn-primary" id="rename-session-btn">Rename</button>
                    <button class="btn-primary" id="export-session-btn">Export</button>
                    <button class="btn-danger" id="delete-session-btn">Delete</button>
                </div>
            </div>
        `;

        // Setup action buttons
        document.getElementById('rename-session-btn').addEventListener('click', () => {
            this.showRenameDialog(session);
        });

        document.getElementById('export-session-btn').addEventListener('click', () => {
            this.exportSession(session);
        });

        document.getElementById('delete-session-btn').addEventListener('click', () => {
            this.showDeleteConfirm(session);
        });
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
            // Select the renamed session
            const renamedSession = this.sessions.find(s => s.session_id === newSessionId);
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
            
            // Create download link
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `session_${session.session_id}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            // alert(`Session "${session.session_id}" exported successfully`);
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

            // Show loading state
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

            // Reset file input
            document.getElementById('import-session-file').value = '';

            // Reload sessions
            await this.loadSessions();
        } catch (error) {
            alert(`Failed to import session: ${error.message}`);
            document.getElementById('import-session-btn').disabled = false;
            document.getElementById('import-session-btn').textContent = 'Import Session';
        }
    }
}

