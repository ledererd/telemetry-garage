/**
 * User Management module
 * Add, list, and delete web application users
 */

class UserManagementManager {
    constructor(apiClient) {
        this.apiClient = apiClient;
        this.users = [];
    }

    async init() {
        await this.loadUsers();
        this.setupEventListeners();
    }

    setupEventListeners() {
        const addUserBtn = document.getElementById('add-user-btn');
        if (addUserBtn) {
            addUserBtn.addEventListener('click', () => this.showAddUserForm());
        }

        const changeMyPasswordBtn = document.getElementById('change-my-password-btn');
        if (changeMyPasswordBtn) {
            changeMyPasswordBtn.addEventListener('click', () => this.showChangeMyPasswordForm());
        }

        const addUserForm = document.getElementById('add-user-form');
        if (addUserForm && this.apiClient) {
            addUserForm.addEventListener('submit', (e) => this.handleAddUser(e));
        }

        const refreshBtn = document.getElementById('refresh-users-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadUsers());
        }
    }

    async loadUsers() {
        try {
            this.users = await this.apiClient.listUsers();
            this.renderUsersList();
        } catch (error) {
            console.error('Error loading users:', error);
            this.showError('Failed to load users');
        }
    }

    renderUsersList() {
        const list = document.getElementById('users-list');
        if (!list) return;

        list.innerHTML = '';

        if (this.users.length === 0) {
            list.innerHTML = '<div class="empty-state">No users registered. Click "Add User" to create one.</div>';
            return;
        }

        this.users.forEach(user => {
            const item = document.createElement('div');
            item.className = 'user-item device-item';
            const created = user.created_at ? new Date(user.created_at).toLocaleString() : '-';
            item.innerHTML = `
                <div class="user-item-info device-item-info">
                    <div class="user-item-name device-item-name">${this.escapeHtml(user.username)}</div>
                    <div class="user-item-meta device-item-meta">Created: ${created}</div>
                </div>
                <div class="user-item-actions">
                    <button class="btn-small btn-secondary btn-reset-password" data-username="${this.escapeHtml(user.username)}" title="Reset password (generates new one)">Reset Password</button>
                    <button class="btn-small btn-danger btn-delete-user" data-username="${this.escapeHtml(user.username)}" title="Delete user">Delete</button>
                </div>
            `;
            const resetBtn = item.querySelector('.btn-reset-password');
            resetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.confirmResetUserPassword(user.username);
            });
            const deleteBtn = item.querySelector('.btn-delete-user');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.confirmDeleteUser(user.username);
            });
            list.appendChild(item);
        });
    }

    showAddUserForm() {
        const panel = document.getElementById('user-details-panel');
        if (!panel) return;

        panel.innerHTML = `
            <div class="user-form-content">
                <h2>Add User</h2>
                <p class="form-description">Create a new user account. They can sign in with the username and password you provide.</p>
                <form id="add-user-form" class="login-form">
                    <div class="form-group">
                        <label for="add-user-username">Username</label>
                        <input type="text" id="add-user-username" name="username" required minlength="2" maxlength="100" autocomplete="off">
                    </div>
                    <div class="form-group">
                        <label for="add-user-password">Password</label>
                        <input type="password" id="add-user-password" name="password" required minlength="6" autocomplete="new-password">
                    </div>
                    <div id="add-user-error" class="login-error" style="display: none;"></div>
                    <div id="add-user-success" class="create-user-success" style="display: none;"></div>
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary">Create User</button>
                        <button type="button" class="btn btn-secondary" id="cancel-add-user-btn">Cancel</button>
                    </div>
                </form>
            </div>
        `;

        document.getElementById('add-user-form').addEventListener('submit', (e) => this.handleAddUser(e));
        document.getElementById('cancel-add-user-btn').addEventListener('click', () => this.showPlaceholder());
    }

    showPlaceholder() {
        const panel = document.getElementById('user-details-panel');
        if (!panel) return;

        panel.innerHTML = '<div class="user-details-placeholder"><p>Select an action or add a new user</p></div>';
    }

    showChangeMyPasswordForm() {
        const panel = document.getElementById('user-details-panel');
        if (!panel) return;

        panel.innerHTML = `
            <div class="user-form-content">
                <h2>Change My Password</h2>
                <p class="form-description">Enter your current password and choose a new one. You will stay logged in.</p>
                <form id="change-password-form" class="login-form">
                    <div class="form-group">
                        <label for="change-password-old">Current Password</label>
                        <input type="password" id="change-password-old" name="old_password" required autocomplete="current-password">
                    </div>
                    <div class="form-group">
                        <label for="change-password-new">New Password</label>
                        <input type="password" id="change-password-new" name="new_password" required minlength="6" autocomplete="new-password">
                    </div>
                    <div class="form-group">
                        <label for="change-password-confirm">Confirm New Password</label>
                        <input type="password" id="change-password-confirm" name="new_password_confirm" required minlength="6" autocomplete="new-password">
                    </div>
                    <div id="change-password-error" class="login-error" style="display: none;"></div>
                    <div id="change-password-success" class="create-user-success" style="display: none;"></div>
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary">Change Password</button>
                        <button type="button" class="btn btn-secondary" id="cancel-change-password-btn">Cancel</button>
                    </div>
                </form>
            </div>
        `;

        document.getElementById('change-password-form').addEventListener('submit', (e) => this.handleChangeMyPassword(e));
        document.getElementById('cancel-change-password-btn').addEventListener('click', () => this.showPlaceholder());
    }

    async handleChangeMyPassword(e) {
        e.preventDefault();
        const errorEl = document.getElementById('change-password-error');
        const successEl = document.getElementById('change-password-success');
        if (errorEl) errorEl.style.display = 'none';
        if (successEl) successEl.style.display = 'none';

        const oldPassword = document.getElementById('change-password-old').value;
        const newPassword = document.getElementById('change-password-new').value;
        const confirmPassword = document.getElementById('change-password-confirm').value;

        if (newPassword !== confirmPassword) {
            errorEl.textContent = 'New passwords do not match';
            errorEl.style.display = 'block';
            return;
        }

        if (newPassword.length < 6) {
            errorEl.textContent = 'New password must be at least 6 characters';
            errorEl.style.display = 'block';
            return;
        }

        try {
            await this.apiClient.changeMyPassword(oldPassword, newPassword);
            successEl.textContent = 'Password changed successfully.';
            successEl.style.display = 'block';
            document.getElementById('change-password-old').value = '';
            document.getElementById('change-password-new').value = '';
            document.getElementById('change-password-confirm').value = '';
        } catch (err) {
            errorEl.textContent = err.message || 'Failed to change password';
            errorEl.style.display = 'block';
        }
    }

    async confirmResetUserPassword(username) {
        if (!confirm(`Reset password for "${username}"? A new random password will be generated and shown. They will need to use it to sign in (or you can reset again).`)) {
            return;
        }
        try {
            const result = await this.apiClient.resetUserPassword(username);
            this.showResetPasswordResult(username, result.password);
        } catch (error) {
            console.error('Error resetting password:', error);
            alert(`Failed to reset password: ${error.message}`);
        }
    }

    showResetPasswordResult(username, password) {
        const panel = document.getElementById('user-details-panel');
        if (!panel) return;

        panel.innerHTML = `
            <div class="user-form-content">
                <h2>Password Reset</h2>
                <p class="form-description">New password for <strong>${this.escapeHtml(username)}</strong>. Give this to the user — it cannot be retrieved again.</p>
                <div class="form-group">
                    <label>New Password</label>
                    <div class="password-display-row">
                        <code id="reset-password-value" class="password-value">${this.escapeHtml(password)}</code>
                        <button type="button" class="btn btn-secondary btn-copy-password" title="Copy to clipboard">Copy</button>
                    </div>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-primary" id="done-reset-password-btn">Done</button>
                </div>
            </div>
        `;

        document.querySelector('.btn-copy-password').addEventListener('click', () => {
            navigator.clipboard.writeText(password).then(() => {
                const btn = document.querySelector('.btn-copy-password');
                const orig = btn.textContent;
                btn.textContent = 'Copied!';
                setTimeout(() => { btn.textContent = orig; }, 2000);
            });
        });
        document.getElementById('done-reset-password-btn').addEventListener('click', () => this.showPlaceholder());
    }

    async handleAddUser(e) {
        e.preventDefault();
        const errorEl = document.getElementById('add-user-error');
        const successEl = document.getElementById('add-user-success');
        if (errorEl) errorEl.style.display = 'none';
        if (successEl) successEl.style.display = 'none';

        const username = document.getElementById('add-user-username').value.trim();
        const password = document.getElementById('add-user-password').value;

        try {
            await this.apiClient.createUser(username, password);
            if (successEl) {
                successEl.textContent = `User "${username}" created successfully. They can now sign in.`;
                successEl.style.display = 'block';
            }
            document.getElementById('add-user-username').value = '';
            document.getElementById('add-user-password').value = '';
            await this.loadUsers();
        } catch (err) {
            if (errorEl) {
                errorEl.textContent = err.message || 'Failed to create user';
                errorEl.style.display = 'block';
            }
        }
    }

    async confirmDeleteUser(username) {
        if (!confirm(`Delete user "${username}"? They will no longer be able to sign in.`)) {
            return;
        }
        try {
            await this.apiClient.deleteUser(username);
            await this.loadUsers();
            this.showPlaceholder();
        } catch (error) {
            console.error('Error deleting user:', error);
            alert(`Failed to delete user: ${error.message}`);
        }
    }

    showError(message) {
        const list = document.getElementById('users-list');
        if (list) {
            list.innerHTML = `<div class="empty-state error-state">${this.escapeHtml(message)}</div>`;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
