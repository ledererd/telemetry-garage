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
    }

    async loadDevices() {
        try {
            this.devices = await this.apiClient.getDevices();
            this.renderDevicesList();
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
            item.innerHTML = `
                <div class="device-item-info">
                    <div class="device-item-name">${this.escapeHtml(device.device_id)}</div>
                    <div class="device-item-meta">Key: ${this.escapeHtml(device.api_key_preview || '...')}</div>
                </div>
            `;
            item.addEventListener('click', () => this.selectDevice(device));
            list.appendChild(item);
        });
    }

    selectDevice(device) {
        this.selectedDevice = device;
        this.renderDevicesList();
        this.renderDeviceDetails(device);
    }

    renderDeviceDetails(device) {
        const panel = document.getElementById('device-details-panel');
        if (!panel) return;

        const created = device.created_at ? new Date(device.created_at).toLocaleString() : '-';
        const updated = device.updated_at ? new Date(device.updated_at).toLocaleString() : '-';

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
                </div>
                <div class="device-config-hint">
                    <p>Add to device config.json:</p>
                    <pre>{
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
