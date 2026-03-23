/**
 * Device Management module
 * Register in-car capture devices and manage API keys
 */

class DeviceManagementManager {
    constructor(apiClient) {
        this.apiClient = apiClient;
        this.devices = [];
        this.selectedDevice = null;
    }

    async init() {
        await this.loadDevices();
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('register-device-btn').addEventListener('click', () => {
            this.showRegisterForm();
        });
        const refreshBtn = document.getElementById('refresh-devices-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadDevices());
        }
    }

    async loadDevices() {
        try {
            this.devices = await this.apiClient.getDevices();
            this.renderDevicesList();
            if (this.selectedDevice) {
                const updated = this.devices.find(d => d.device_id === this.selectedDevice.device_id);
                if (updated) {
                    this.selectedDevice = { ...this.selectedDevice, ...updated };
                    this.renderDeviceDetails(this.selectedDevice);
                }
            }
        } catch (error) {
            console.error('Error loading devices:', error);
            this.showError('Failed to load devices');
        }
    }

    renderDevicesList() {
        const list = document.getElementById('devices-list');
        if (!list) return;

        list.innerHTML = '';

        if (this.devices.length === 0) {
            list.innerHTML = '<div class="empty-state">No devices registered. Click "Register Device" to add one.</div>';
            return;
        }

        this.devices.forEach(device => {
            const item = document.createElement('div');
            item.className = 'device-item';
            if (this.selectedDevice && this.selectedDevice.device_id === device.device_id) {
                item.classList.add('selected');
            }
            const statusClass = device.connected ? 'device-status-connected' : 'device-status-disconnected';
            const statusTitle = device.connected
                ? 'Connected'
                : (device.last_seen_at ? `Last seen: ${new Date(device.last_seen_at).toLocaleString()}` : 'Never seen');
            item.innerHTML = `
                <div class="device-item-info device-item-with-status">
                    <span class="device-status-dot ${statusClass}" title="${this.escapeHtml(statusTitle)}" aria-label="${statusTitle}"></span>
                    <div>
                        <div class="device-item-name">${this.escapeHtml(device.device_id)}</div>
                        <div class="device-item-meta">Key: ${this.escapeHtml(device.api_key_preview || '...')}</div>
                    </div>
                </div>
            `;
            item.addEventListener('click', () => this.selectDevice(device));
            list.appendChild(item);
        });
    }

    async selectDevice(device) {
        this.selectedDevice = device;
        this.renderDevicesList();
        try {
            const fullDevice = await this.apiClient.getDevice(device.device_id);
            this.selectedDevice = { ...device, ...fullDevice };
            this.renderDeviceDetails(this.selectedDevice);
        } catch (error) {
            console.error('Error loading device details:', error);
            this.renderDeviceDetails(device);
        }
    }

    renderDeviceDetails(device) {
        const panel = document.getElementById('device-details-panel');
        if (!panel) return;

        const created = device.created_at ? new Date(device.created_at).toLocaleString() : '-';
        const updated = device.updated_at ? new Date(device.updated_at).toLocaleString() : '-';
        const lastSeen = device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : 'Never';
        const statusText = device.connected ? 'Connected' : 'Not connected';
        const configJson = device.config
            ? JSON.stringify(device.config, null, 2)
            : '{\n  "api_url": "http://your-server:8000/api/v1/telemetry/upload/batch",\n  "device_id": "' + this.escapeHtml(device.device_id) + '",\n  "sampling_rate": 10,\n  "batch_size": 100\n}';
        const configEscaped = configJson.replace(/&/g, '&amp;').replace(/</g, '&lt;');

        panel.innerHTML = `
            <div class="device-details-content">
                <h2>${this.escapeHtml(device.device_id)}</h2>
                <div class="device-details-section">
                    <h3>Device Information</h3>
                    <div class="detail-row">
                        <span class="detail-label">Device ID:</span>
                        <span class="detail-value">${this.escapeHtml(device.device_id)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Key Preview:</span>
                        <span class="detail-value monospace">${this.escapeHtml(device.api_key_preview || '-')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Registered:</span>
                        <span class="detail-value">${created}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Last Updated:</span>
                        <span class="detail-value">${updated}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Status:</span>
                        <span class="detail-value">${statusText} (last seen: ${lastSeen})</span>
                    </div>
                </div>
                <div class="device-details-section">
                    <h3>Device Configuration</h3>
                    <p class="device-config-description">Configuration is pulled by the device on startup. Do not include <code>api_key</code> here &ndash; it stays in the device's local config.json.</p>
                    <textarea id="device-config-editor" class="device-config-editor" rows="16" spellcheck="false">${configEscaped}</textarea>
                    <div id="device-config-error" class="login-error" style="display: none;"></div>
                    <div id="device-config-success" class="create-user-success" style="display: none;"></div>
                    <button class="btn-primary" id="save-device-config-btn">Save Configuration</button>
                </div>
                <div class="device-config-hint">
                    <p>Local config.json (on device) must have at minimum:</p>
                    <pre>{
  "api_url": "&lt;data platform URL&gt;/api/v1/telemetry/upload/batch",
  "device_id": "${this.escapeHtml(device.device_id)}",
  "api_key": "&lt;copy from Register or Refresh&gt;"
}</pre>
                </div>
                <div class="device-details-actions">
                    <button class="btn-primary" id="refresh-device-key-btn">Refresh Key</button>
                    <button class="btn-danger" id="delete-device-btn">Delete Device</button>
                </div>
            </div>
        `;

        document.getElementById('refresh-device-key-btn').addEventListener('click', () => this.refreshKey(device));
        document.getElementById('delete-device-btn').addEventListener('click', () => this.deleteDevice(device));
        document.getElementById('save-device-config-btn').addEventListener('click', () => this.saveDeviceConfig(device));
    }

    async saveDeviceConfig(device) {
        const editor = document.getElementById('device-config-editor');
        const errorEl = document.getElementById('device-config-error');
        const successEl = document.getElementById('device-config-success');
        if (errorEl) errorEl.style.display = 'none';
        if (successEl) successEl.style.display = 'none';

        let config;
        try {
            config = JSON.parse(editor.value);
        } catch (e) {
            if (errorEl) {
                errorEl.textContent = 'Invalid JSON: ' + e.message;
                errorEl.style.display = 'block';
            }
            return;
        }

        try {
            await this.apiClient.updateDeviceConfig(device.device_id, config);
            if (successEl) {
                successEl.textContent = 'Configuration saved. The device will use it on next startup.';
                successEl.style.display = 'block';
            }
        } catch (error) {
            if (errorEl) {
                errorEl.textContent = error.message || 'Failed to save configuration';
                errorEl.style.display = 'block';
            }
        }
    }

    showRegisterForm() {
        const deviceId = prompt('Enter device ID (e.g. telemetry_unit_001):');
        if (!deviceId || !deviceId.trim()) return;

        const trimmed = deviceId.trim();
        this.registerDevice(trimmed);
    }

    async registerDevice(deviceId) {
        try {
            const result = await this.apiClient.registerDevice(deviceId);
            await this.loadDevices();
            this.selectDevice({ ...result, api_key_preview: result.api_key ? result.api_key.substring(0, 8) + '...' : null });
            this.showKeyModal('New Device Registered', deviceId, result.api_key, 'Copy this key to the device config.json. It will not be shown again.');
        } catch (error) {
            alert(`Failed to register device: ${error.message}`);
        }
    }

    async refreshKey(device) {
        if (!confirm(`Generate a new API key for ${device.device_id}?\n\nThe current key will stop working immediately.`)) return;

        try {
            const result = await this.apiClient.refreshDeviceKey(device.device_id);
            await this.loadDevices();
            this.selectDevice({ ...device, ...result, api_key_preview: result.api_key ? result.api_key.substring(0, 8) + '...' : null });
            this.showKeyModal('Key Refreshed', device.device_id, result.api_key, 'Copy this key to the device config.json. The old key no longer works.');
        } catch (error) {
            alert(`Failed to refresh key: ${error.message}`);
        }
    }

    showKeyModal(title, deviceId, apiKey, message) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>${title}</h2>
                <p>${message}</p>
                <div class="key-display">
                    <label>API Key for ${this.escapeHtml(deviceId)}:</label>
                    <div class="key-value-row">
                        <input type="text" id="api-key-input" value="${this.escapeHtml(apiKey || '')}" readonly>
                        <button class="btn-secondary" id="copy-key-btn">Copy</button>
                    </div>
                </div>
                <button class="btn-primary" id="close-key-modal">Close</button>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('copy-key-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(apiKey).then(() => {
                const btn = document.getElementById('copy-key-btn');
                btn.textContent = 'Copied!';
                setTimeout(() => btn.textContent = 'Copy', 2000);
            });
        });
        document.getElementById('close-key-modal').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    }

    async deleteDevice(device) {
        if (!confirm(`Delete device "${device.device_id}"?\n\nThis device will no longer be able to upload telemetry.`)) return;

        try {
            await this.apiClient.deleteDevice(device.device_id);
            this.selectedDevice = null;
            await this.loadDevices();
            document.getElementById('device-details-panel').innerHTML = '<div class="device-details-placeholder"><p>Select a device or register a new one</p></div>';
        } catch (error) {
            alert(`Failed to delete device: ${error.message}`);
        }
    }

    showError(message) {
        const list = document.getElementById('devices-list');
        if (list) list.innerHTML = `<div class="empty-state error">${message}</div>`;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
