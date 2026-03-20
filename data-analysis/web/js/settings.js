/**
 * Settings Manager
 * Handles application settings including theme management
 * Designed to be extensible for future settings
 */

class SettingsManager {
    constructor(apiClient = null) {
        this.apiClient = apiClient;
        this.settings = {
            theme: 'dark' // default theme
        };
        this.loadSettings();
        // Apply theme immediately on construction
        this.applyTheme();
    }

    /**
     * Load settings from localStorage
     */
    loadSettings() {
        try {
            const saved = localStorage.getItem('racingAppSettings');
            if (saved) {
                this.settings = { ...this.settings, ...JSON.parse(saved) };
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    /**
     * Save settings to localStorage
     */
    saveSettings() {
        try {
            localStorage.setItem('racingAppSettings', JSON.stringify(this.settings));
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }

    /**
     * Get a setting value
     * @param {string} key - Setting key
     * @param {*} defaultValue - Default value if not found
     * @returns {*} Setting value
     */
    getSetting(key, defaultValue = null) {
        return this.settings[key] !== undefined ? this.settings[key] : defaultValue;
    }

    /**
     * Set a setting value
     * @param {string} key - Setting key
     * @param {*} value - Setting value
     */
    setSetting(key, value) {
        this.settings[key] = value;
        this.saveSettings();
        this.applySettings();
    }

    /**
     * Apply all settings to the application
     */
    applySettings() {
        this.applyTheme();
        // Future settings can be applied here
        // Example: this.applyLanguage();
        // Example: this.applyUnits();
    }

    /**
     * Apply theme setting
     */
    applyTheme() {
        const theme = this.getSetting('theme', 'dark');
        document.body.setAttribute('data-theme', theme);
        
        // Update theme selector if it exists
        const themeSelect = document.getElementById('theme-select');
        if (themeSelect) {
            themeSelect.value = theme;
        }
    }

    /**
     * Initialize the settings screen UI
     */
    init() {
        this.setupEventListeners();
        this.loadSettingsToUI();
    }

    /**
     * Setup event listeners for settings controls
     */
    setupEventListeners() {
        // Theme selector
        const themeSelect = document.getElementById('theme-select');
        if (themeSelect) {
            themeSelect.addEventListener('change', (e) => {
                this.setSetting('theme', e.target.value);
            });
        }

    }

    /**
     * Load current settings into UI controls
     */
    loadSettingsToUI() {
        const themeSelect = document.getElementById('theme-select');
        if (themeSelect) {
            themeSelect.value = this.getSetting('theme', 'dark');
        }
    }
}

