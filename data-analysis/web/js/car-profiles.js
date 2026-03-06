/**
 * Car Profiles management module
 */

class CarProfilesManager {
    constructor(apiClient) {
        this.apiClient = apiClient;
        this.profiles = [];
        this.selectedProfile = null;
    }

    async init() {
        await this.loadProfiles();
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('add-car-profile-btn').addEventListener('click', () => {
            this.showAddProfileForm();
        });
    }

    async loadProfiles() {
        try {
            this.profiles = await this.apiClient.getCarProfiles();
            this.renderProfilesList();
        } catch (error) {
            console.error('Error loading car profiles:', error);
            this.showError('Failed to load car profiles');
        }
    }

    renderProfilesList() {
        const list = document.getElementById('car-profiles-list');
        list.innerHTML = '';

        if (this.profiles.length === 0) {
            list.innerHTML = '<div class="empty-state">No car profiles found. Click "Add Profile" to create one.</div>';
            return;
        }

        this.profiles.forEach(profile => {
            const item = document.createElement('div');
            item.className = 'car-profile-item';
            item.innerHTML = `
                <div class="car-profile-item-header">
                    <h3>${this.escapeHtml(profile.name)}</h3>
                    <span class="car-profile-type-badge">${this.escapeHtml(profile.veh_pars.powertrain_type)}</span>
                </div>
                <div class="car-profile-item-meta">
                    <span>ID: ${this.escapeHtml(profile.profile_id)}</span>
                </div>
                <div class="car-profile-item-actions">
                    <button class="btn-small btn-primary" data-action="view" data-profile-id="${this.escapeHtml(profile.profile_id)}">View</button>
                    <button class="btn-small btn-secondary" data-action="edit" data-profile-id="${this.escapeHtml(profile.profile_id)}">Edit</button>
                    <button class="btn-small btn-secondary" data-action="clone" data-profile-id="${this.escapeHtml(profile.profile_id)}">Clone</button>
                    <button class="btn-small btn-danger" data-action="delete" data-profile-id="${this.escapeHtml(profile.profile_id)}">Delete</button>
                </div>
            `;
            
            // Add event listeners
            item.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const action = btn.dataset.action;
                    const profileId = btn.dataset.profileId;
                    e.stopPropagation();
                    
                    if (action === 'view') {
                        this.viewProfile(profileId);
                    } else if (action === 'edit') {
                        this.editProfile(profileId);
                    } else if (action === 'clone') {
                        this.showCloneForm(profileId);
                    } else if (action === 'delete') {
                        this.deleteProfile(profileId);
                    }
                });
            });
            
            list.appendChild(item);
        });
    }

    async viewProfile(profileId) {
        try {
            const profile = await this.apiClient.getCarProfile(profileId);
            this.selectedProfile = profile;
            this.renderProfileDetails(profile, false);
        } catch (error) {
            console.error('Error loading profile:', error);
            this.showError('Failed to load profile');
        }
    }

    async editProfile(profileId) {
        try {
            const profile = await this.apiClient.getCarProfile(profileId);
            this.selectedProfile = profile;
            this.renderProfileDetails(profile, true);
        } catch (error) {
            console.error('Error loading profile:', error);
            this.showError('Failed to load profile');
        }
    }

    showAddProfileForm() {
        const defaultProfile = this.getDefaultProfile();
        this.selectedProfile = null;
        this.renderProfileDetails(defaultProfile, true);
    }

    async showCloneForm(profileId) {
        const newName = prompt('Enter name for the cloned profile:');
        if (!newName) return;

        const newId = prompt('Enter ID for the cloned profile:');
        if (!newId) return;

        try {
            await this.apiClient.cloneCarProfile(profileId, newId, newName);
            await this.loadProfiles();
            this.showSuccess('Profile cloned successfully');
        } catch (error) {
            console.error('Error cloning profile:', error);
            this.showError(`Failed to clone profile: ${error.message}`);
        }
    }

    async deleteProfile(profileId) {
        if (!confirm('Are you sure you want to delete this profile?')) {
            return;
        }

        try {
            await this.apiClient.deleteCarProfile(profileId);
            await this.loadProfiles();
            this.showSuccess('Profile deleted successfully');
            
            // Clear details panel if deleted profile was selected
            if (this.selectedProfile && this.selectedProfile.profile_id === profileId) {
                this.renderProfileDetailsPlaceholder();
            }
        } catch (error) {
            console.error('Error deleting profile:', error);
            this.showError(`Failed to delete profile: ${error.message}`);
        }
    }

    renderProfileDetailsPlaceholder() {
        const panel = document.getElementById('car-profile-details-panel');
        panel.innerHTML = `
            <div class="car-profile-details-placeholder">
                <p>Select a profile to view or edit</p>
            </div>
        `;
    }

    renderProfileDetails(profile, isEditable) {
        const panel = document.getElementById('car-profile-details-panel');
        const isNew = !this.selectedProfile;
        
        panel.innerHTML = `
            <div class="car-profile-form-container">
                <div class="car-profile-form-header">
                    <h2>${isNew ? 'Create New' : (isEditable ? 'Edit' : 'View')} Car Profile</h2>
                    ${!isEditable ? `<button class="btn-small btn-primary" id="edit-profile-btn">Edit</button>` : ''}
                </div>
                
                <form id="car-profile-form" class="car-profile-form">
                    <div class="form-section">
                        <h3>Basic Information</h3>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="profile-id">Profile ID *</label>
                                <input type="text" id="profile-id" name="profile_id" 
                                       value="${this.escapeHtml(profile.profile_id || '')}" 
                                       ${!isEditable || !isNew ? 'readonly' : ''} required>
                            </div>
                            <div class="form-group">
                                <label for="profile-name">Profile Name *</label>
                                <input type="text" id="profile-name" name="name" 
                                       value="${this.escapeHtml(profile.name || '')}" 
                                       ${!isEditable ? 'readonly' : ''} required>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="powertrain-type">Powertrain Type *</label>
                                <select id="powertrain-type" name="powertrain_type" ${!isEditable ? 'disabled' : ''} required>
                                    <option value="electric" ${profile.veh_pars?.powertrain_type === 'electric' ? 'selected' : ''}>Electric</option>
                                    <option value="hybrid" ${profile.veh_pars?.powertrain_type === 'hybrid' ? 'selected' : ''}>Hybrid</option>
                                    <option value="combustion" ${profile.veh_pars?.powertrain_type === 'combustion' ? 'selected' : ''}>Combustion</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    ${this.renderGeneralParams(profile.veh_pars?.general || {}, isEditable)}
                    ${this.renderEngineParams(profile.veh_pars?.engine || {}, isEditable)}
                    ${this.renderGearboxParams(profile.veh_pars?.gearbox || {}, isEditable)}
                    ${this.renderTiresParams(profile.veh_pars?.tires || {}, isEditable)}

                    ${isEditable ? `
                        <div class="form-actions">
                            <button type="submit" class="btn-primary">${isNew ? 'Create' : 'Save'}</button>
                            <button type="button" class="btn-secondary" id="cancel-profile-btn">Cancel</button>
                        </div>
                    ` : ''}
                </form>
            </div>
        `;

        if (!isEditable) {
            document.getElementById('edit-profile-btn').addEventListener('click', () => {
                this.editProfile(profile.profile_id);
            });
        } else {
            const form = document.getElementById('car-profile-form');
            // Store isNew state for the form submit handler
            const isNewProfile = isNew;
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveProfile(isNewProfile);
            });

            document.getElementById('cancel-profile-btn').addEventListener('click', () => {
                if (this.selectedProfile) {
                    this.renderProfileDetails(this.selectedProfile, false);
                } else {
                    this.renderProfileDetailsPlaceholder();
                }
            });

            // Setup gearbox handlers
            this.setupGearboxHandlers();
        }
    }

    renderGeneralParams(general, isEditable) {
        return `
            <div class="form-section">
                <h3>General Parameters</h3>
                <div class="form-grid">
                    <div class="form-group">
                        <label for="lf">lf [m] - Front axle to COG *</label>
                        <input type="number" id="lf" name="lf" step="0.001" 
                               value="${general.lf || ''}" ${!isEditable ? 'readonly' : ''} required>
                    </div>
                    <div class="form-group">
                        <label for="lr">lr [m] - Rear axle to COG *</label>
                        <input type="number" id="lr" name="lr" step="0.001" 
                               value="${general.lr || ''}" ${!isEditable ? 'readonly' : ''} required>
                    </div>
                    <div class="form-group">
                        <label for="h_cog">h_cog [m] - Height of COG *</label>
                        <input type="number" id="h_cog" name="h_cog" step="0.001" 
                               value="${general.h_cog || ''}" ${!isEditable ? 'readonly' : ''} required>
                    </div>
                    <div class="form-group">
                        <label for="sf">sf [m] - Track width front *</label>
                        <input type="number" id="sf" name="sf" step="0.001" 
                               value="${general.sf || ''}" ${!isEditable ? 'readonly' : ''} required>
                    </div>
                    <div class="form-group">
                        <label for="sr">sr [m] - Track width rear *</label>
                        <input type="number" id="sr" name="sr" step="0.001" 
                               value="${general.sr || ''}" ${!isEditable ? 'readonly' : ''} required>
                    </div>
                    <div class="form-group">
                        <label for="m">m [kg] - Vehicle mass *</label>
                        <input type="number" id="m" name="m" step="0.1" 
                               value="${general.m || ''}" ${!isEditable ? 'readonly' : ''} required>
                    </div>
                    <div class="form-group">
                        <label for="f_roll">f_roll [-] - Rolling resistance *</label>
                        <input type="number" id="f_roll" name="f_roll" step="0.0001" 
                               value="${general.f_roll || ''}" ${!isEditable ? 'readonly' : ''} required>
                    </div>
                    <div class="form-group">
                        <label for="c_w_a">c_w_a [m²] - Air resistance *</label>
                        <input type="number" id="c_w_a" name="c_w_a" step="0.01" 
                               value="${general.c_w_a || ''}" ${!isEditable ? 'readonly' : ''} required>
                    </div>
                    <div class="form-group">
                        <label for="c_z_a_f">c_z_a_f [m²] - Front wing *</label>
                        <input type="number" id="c_z_a_f" name="c_z_a_f" step="0.01" 
                               value="${general.c_z_a_f || ''}" ${!isEditable ? 'readonly' : ''} required>
                    </div>
                    <div class="form-group">
                        <label for="c_z_a_r">c_z_a_r [m²] - Rear wing *</label>
                        <input type="number" id="c_z_a_r" name="c_z_a_r" step="0.01" 
                               value="${general.c_z_a_r || ''}" ${!isEditable ? 'readonly' : ''} required>
                    </div>
                    <div class="form-group">
                        <label for="g">g [m/s²] - Gravity *</label>
                        <input type="number" id="g" name="g" step="0.01" 
                               value="${general.g || 9.81}" ${!isEditable ? 'readonly' : ''} required>
                    </div>
                    <div class="form-group">
                        <label for="rho_air">rho_air [kg/m³] - Air density *</label>
                        <input type="number" id="rho_air" name="rho_air" step="0.01" 
                               value="${general.rho_air || ''}" ${!isEditable ? 'readonly' : ''} required>
                    </div>
                    <div class="form-group">
                        <label for="drs_factor">drs_factor [-] - DRS factor *</label>
                        <input type="number" id="drs_factor" name="drs_factor" step="0.01" min="0" max="1" 
                               value="${general.drs_factor || 0}" ${!isEditable ? 'readonly' : ''} required>
                    </div>
                </div>
            </div>
        `;
    }

    renderEngineParams(engine, isEditable) {
        return `
            <div class="form-section">
                <h3>Engine/Powertrain Parameters</h3>
                <div class="form-grid">
                    <div class="form-group">
                        <label for="topology">topology - Drive topology *</label>
                        <select id="topology" name="topology" ${!isEditable ? 'disabled' : ''} required>
                            <option value="RWD" ${engine.topology === 'RWD' ? 'selected' : ''}>RWD</option>
                            <option value="AWD" ${engine.topology === 'AWD' ? 'selected' : ''}>AWD</option>
                            <option value="FWD" ${engine.topology === 'FWD' ? 'selected' : ''}>FWD</option>
                        </select>
                    </div>
                </div>
                
                <h4 style="margin-top: 1.5rem; margin-bottom: 0.5rem; color: #888;">ICE (Internal Combustion Engine) Parameters</h4>
                <div class="form-grid">
                    <div class="form-group">
                        <label for="pow_max">pow_max [W] - Maximum power</label>
                        <input type="number" id="pow_max" name="pow_max" step="1000" 
                               value="${engine.pow_max || ''}" ${!isEditable ? 'readonly' : ''}>
                    </div>
                    <div class="form-group">
                        <label for="pow_diff">pow_diff [W] - Power drop from maximum power</label>
                        <input type="number" id="pow_diff" name="pow_diff" step="1000" 
                               value="${engine.pow_diff || ''}" ${!isEditable ? 'readonly' : ''}>
                    </div>
                    <div class="form-group">
                        <label for="n_begin">n_begin [1/min] - Engine rpm at pow_max - pow_diff</label>
                        <input type="number" id="n_begin" name="n_begin" step="100" 
                               value="${engine.n_begin || ''}" ${!isEditable ? 'readonly' : ''}>
                    </div>
                    <div class="form-group">
                        <label for="n_max">n_max [1/min] - Engine rpm at pow_max</label>
                        <input type="number" id="n_max" name="n_max" step="100" 
                               value="${engine.n_max || ''}" ${!isEditable ? 'readonly' : ''}>
                    </div>
                    <div class="form-group">
                        <label for="n_end">n_end [1/min] - Engine rpm at pow_max - pow_diff</label>
                        <input type="number" id="n_end" name="n_end" step="100" 
                               value="${engine.n_end || ''}" ${!isEditable ? 'readonly' : ''}>
                    </div>
                    <div class="form-group">
                        <label for="be_max">be_max [kg/h] - Fuel consumption</label>
                        <input type="number" id="be_max" name="be_max" step="0.1" 
                               value="${engine.be_max || ''}" ${!isEditable ? 'readonly' : ''}>
                    </div>
                </div>
                
                <h4 style="margin-top: 1.5rem; margin-bottom: 0.5rem; color: #888;">EV/Hybrid Parameters</h4>
                <div class="form-grid">
                    <div class="form-group">
                        <label for="pow_e_motor">pow_e_motor [W] - Motor power</label>
                        <input type="number" id="pow_e_motor" name="pow_e_motor" step="1000" 
                               value="${engine.pow_e_motor || ''}" ${!isEditable ? 'readonly' : ''}>
                    </div>
                    <div class="form-group">
                        <label for="eta_e_motor">eta_e_motor [-] - Motor efficiency (drive)</label>
                        <input type="number" id="eta_e_motor" name="eta_e_motor" step="0.01" min="0" max="1" 
                               value="${engine.eta_e_motor || ''}" ${!isEditable ? 'readonly' : ''}>
                    </div>
                    <div class="form-group">
                        <label for="eta_e_motor_re">eta_e_motor_re [-] - Motor efficiency (recuperation)</label>
                        <input type="number" id="eta_e_motor_re" name="eta_e_motor_re" step="0.01" min="0" max="1" 
                               value="${engine.eta_e_motor_re || ''}" ${!isEditable ? 'readonly' : ''}>
                    </div>
                    <div class="form-group">
                        <label for="eta_etc_re">eta_etc_re [-] - Efficiency electric turbocharger (recuperation)</label>
                        <input type="number" id="eta_etc_re" name="eta_etc_re" step="0.01" min="0" max="1" 
                               value="${engine.eta_etc_re || ''}" ${!isEditable ? 'readonly' : ''}>
                    </div>
                    <div class="form-group">
                        <label for="vel_min_e_motor">vel_min_e_motor [m/s] - Minimum velocity to use electric motor</label>
                        <input type="number" id="vel_min_e_motor" name="vel_min_e_motor" step="0.1" 
                               value="${engine.vel_min_e_motor || ''}" ${!isEditable ? 'readonly' : ''}>
                    </div>
                    <div class="form-group">
                        <label for="torque_e_motor_max">torque_e_motor_max [Nm] - Max torque</label>
                        <input type="number" id="torque_e_motor_max" name="torque_e_motor_max" step="0.1" 
                               value="${engine.torque_e_motor_max || ''}" ${!isEditable ? 'readonly' : ''}>
                    </div>
                </div>
            </div>
        `;
    }

    renderGearboxParams(gearbox, isEditable) {
        const iTrans = gearbox.i_trans || [];
        const nShift = gearbox.n_shift || [];
        const eI = gearbox.e_i || [];
        const maxGears = Math.max(iTrans.length, nShift.length, eI.length, 1);
        
        let gearRows = '';
        for (let i = 0; i < maxGears; i++) {
            gearRows += `
                <div class="gear-row">
                    <h4>Gear ${i + 1}</h4>
                    <div class="form-group">
                        <label for="i_trans_${i}">i_trans [-] - Gear ratio *</label>
                        <input type="number" id="i_trans_${i}" name="i_trans_${i}" step="0.0001" 
                               value="${iTrans[i] || ''}" ${!isEditable ? 'readonly' : ''} required>
                    </div>
                    <div class="form-group">
                        <label for="n_shift_${i}">n_shift [1/min] - Shift RPM *</label>
                        <input type="number" id="n_shift_${i}" name="n_shift_${i}" step="100" 
                               value="${nShift[i] || ''}" ${!isEditable ? 'readonly' : ''} required>
                    </div>
                    <div class="form-group">
                        <label for="e_i_${i}">e_i [-] - Torsional mass factor *</label>
                        <input type="number" id="e_i_${i}" name="e_i_${i}" step="0.01" 
                               value="${eI[i] || ''}" ${!isEditable ? 'readonly' : ''} required>
                    </div>
                    ${isEditable ? `<button type="button" class="btn-small btn-danger remove-gear-btn" data-gear="${i}">Remove</button>` : ''}
                </div>
            `;
        }

        return `
            <div class="form-section">
                <h3>Gearbox/Transmission Parameters</h3>
                <div id="gearbox-gears">
                    ${gearRows}
                </div>
                ${isEditable ? `
                    <button type="button" class="btn-secondary" id="add-gear-btn">+ Add Gear</button>
                ` : ''}
                <div class="form-group">
                    <label for="eta_g">eta_g [-] - Gearbox efficiency *</label>
                    <input type="number" id="eta_g" name="eta_g" step="0.01" min="0" max="1" 
                           value="${gearbox.eta_g || ''}" ${!isEditable ? 'readonly' : ''} required>
                </div>
            </div>
        `;
    }

    setupGearboxHandlers() {
        const addGearBtn = document.getElementById('add-gear-btn');
        if (addGearBtn) {
            addGearBtn.addEventListener('click', () => {
                this.addGear();
            });
        }

        document.querySelectorAll('.remove-gear-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const gearIndex = parseInt(btn.dataset.gear);
                this.removeGear(gearIndex);
            });
        });
    }

    addGear() {
        const gearboxGears = document.getElementById('gearbox-gears');
        const currentGears = gearboxGears.querySelectorAll('.gear-row').length;
        const gearIndex = currentGears;
        
        const gearRow = document.createElement('div');
        gearRow.className = 'gear-row';
        gearRow.innerHTML = `
            <h4>Gear ${gearIndex + 1}</h4>
            <div class="form-group">
                <label for="i_trans_${gearIndex}">i_trans [-] - Gear ratio *</label>
                <input type="number" id="i_trans_${gearIndex}" name="i_trans_${gearIndex}" step="0.0001" 
                       value="" required>
            </div>
            <div class="form-group">
                <label for="n_shift_${gearIndex}">n_shift [1/min] - Shift RPM *</label>
                <input type="number" id="n_shift_${gearIndex}" name="n_shift_${gearIndex}" step="100" 
                       value="" required>
            </div>
            <div class="form-group">
                <label for="e_i_${gearIndex}">e_i [-] - Torsional mass factor *</label>
                <input type="number" id="e_i_${gearIndex}" name="e_i_${gearIndex}" step="0.01" 
                       value="" required>
            </div>
            <button type="button" class="btn-small btn-danger remove-gear-btn" data-gear="${gearIndex}">Remove</button>
        `;
        
        gearboxGears.appendChild(gearRow);
        
        // Update gear numbers
        this.updateGearNumbers();
        
        // Setup handler for the new remove button
        gearRow.querySelector('.remove-gear-btn').addEventListener('click', (e) => {
            this.removeGear(gearIndex);
        });
    }

    removeGear(gearIndex) {
        const gearboxGears = document.getElementById('gearbox-gears');
        const gearRows = Array.from(gearboxGears.querySelectorAll('.gear-row'));
        
        if (gearRows.length <= 1) {
            alert('At least one gear is required');
            return;
        }
        
        // Remove the gear row
        gearRows[gearIndex].remove();
        
        // Re-setup handlers for remaining gears
        this.setupGearboxHandlers();
    }

    updateGearNumbers() {
        const gearboxGears = document.getElementById('gearbox-gears');
        const gearRows = gearboxGears.querySelectorAll('.gear-row');
        
        gearRows.forEach((row, index) => {
            row.querySelector('h4').textContent = `Gear ${index + 1}`;
            const removeBtn = row.querySelector('.remove-gear-btn');
            if (removeBtn) {
                removeBtn.dataset.gear = index;
            }
        });
    }

    renderTiresParams(tires, isEditable) {
        const tireFields = ['circ_ref', 'fz_0', 'mux', 'muy', 'dmux_dfz', 'dmuy_dfz'];
        const tireLabels = {
            'circ_ref': 'circ_ref [m] - Reference circumference',
            'fz_0': 'fz_0 [N] - Nominal tire load',
            'mux': 'mux [-] - Longitudinal friction',
            'muy': 'muy [-] - Lateral friction',
            'dmux_dfz': 'dmux_dfz [-] - Longitudinal load reduction',
            'dmuy_dfz': 'dmuy_dfz [-] - Lateral load reduction'
        };

        let frontTireFields = '';
        let rearTireFields = '';
        
        tireFields.forEach(field => {
            const frontValue = tires.f?.[field] || '';
            const rearValue = tires.r?.[field] || '';
            
            frontTireFields += `
                <div class="form-group">
                    <label for="tire_f_${field}">${tireLabels[field]} (Front) *</label>
                    <input type="number" id="tire_f_${field}" name="tire_f_${field}" 
                           step="${field.includes('dmux') || field.includes('dmuy') ? '0.000001' : '0.001'}" 
                           value="${frontValue}" ${!isEditable ? 'readonly' : ''} required>
                </div>
            `;
            
            rearTireFields += `
                <div class="form-group">
                    <label for="tire_r_${field}">${tireLabels[field]} (Rear) *</label>
                    <input type="number" id="tire_r_${field}" name="tire_r_${field}" 
                           step="${field.includes('dmux') || field.includes('dmuy') ? '0.000001' : '0.001'}" 
                           value="${rearValue}" ${!isEditable ? 'readonly' : ''} required>
                </div>
            `;
        });

        return `
            <div class="form-section">
                <h3>Tire Parameters</h3>
                <div class="tire-params-container">
                    <div class="tire-params-section">
                        <h4>Front Tires</h4>
                        ${frontTireFields}
                    </div>
                    <div class="tire-params-section">
                        <h4>Rear Tires</h4>
                        ${rearTireFields}
                    </div>
                </div>
                <div class="form-group">
                    <label for="tire_model_exp">tire_model_exp [-] - Tire model exponent *</label>
                    <input type="number" id="tire_model_exp" name="tire_model_exp" step="0.1" min="1.0" max="2.0" 
                           value="${tires.tire_model_exp || 2.0}" ${!isEditable ? 'readonly' : ''} required>
                </div>
            </div>
        `;
    }

    async saveProfile(isNew) {
        try {
            // Determine if this is a new profile if not explicitly provided
            if (isNew === undefined) {
                isNew = !this.selectedProfile;
            }
            
            const formData = this.collectFormData(isNew);
            
            if (isNew) {
                await this.apiClient.createCarProfile(formData);
                this.showSuccess('Profile created successfully');
            } else {
                await this.apiClient.updateCarProfile(this.selectedProfile.profile_id, formData);
                this.showSuccess('Profile updated successfully');
            }
            
            await this.loadProfiles();
            if (!isNew) {
                await this.viewProfile(this.selectedProfile.profile_id);
            } else {
                this.renderProfileDetailsPlaceholder();
            }
        } catch (error) {
            console.error('Error saving profile:', error);
            this.showError(`Failed to save profile: ${error.message}`);
        }
    }

    collectFormData(isNew = false) {
        const form = document.getElementById('car-profile-form');
        const formData = new FormData(form);
        
        // Basic info
        const profileId = document.getElementById('profile-id').value;
        const name = document.getElementById('profile-name').value;
        const powertrainType = document.getElementById('powertrain-type').value;
        
        // General params
        const general = {
            lf: parseFloat(document.getElementById('lf').value),
            lr: parseFloat(document.getElementById('lr').value),
            h_cog: parseFloat(document.getElementById('h_cog').value),
            sf: parseFloat(document.getElementById('sf').value),
            sr: parseFloat(document.getElementById('sr').value),
            m: parseFloat(document.getElementById('m').value),
            f_roll: parseFloat(document.getElementById('f_roll').value),
            c_w_a: parseFloat(document.getElementById('c_w_a').value),
            c_z_a_f: parseFloat(document.getElementById('c_z_a_f').value),
            c_z_a_r: parseFloat(document.getElementById('c_z_a_r').value),
            g: parseFloat(document.getElementById('g').value),
            rho_air: parseFloat(document.getElementById('rho_air').value),
            drs_factor: parseFloat(document.getElementById('drs_factor').value)
        };
        
        // Engine params - collect all fields, only include if they have values
        const engine = {
            topology: document.getElementById('topology').value
        };
        
        // ICE parameters
        const powMaxEl = document.getElementById('pow_max');
        const powDiffEl = document.getElementById('pow_diff');
        const nBeginEl = document.getElementById('n_begin');
        const nMaxEl = document.getElementById('n_max');
        const nEndEl = document.getElementById('n_end');
        const beMaxEl = document.getElementById('be_max');
        
        if (powMaxEl && powMaxEl.value) engine.pow_max = parseFloat(powMaxEl.value);
        if (powDiffEl && powDiffEl.value) engine.pow_diff = parseFloat(powDiffEl.value);
        if (nBeginEl && nBeginEl.value) engine.n_begin = parseFloat(nBeginEl.value);
        if (nMaxEl && nMaxEl.value) engine.n_max = parseFloat(nMaxEl.value);
        if (nEndEl && nEndEl.value) engine.n_end = parseFloat(nEndEl.value);
        if (beMaxEl && beMaxEl.value) engine.be_max = parseFloat(beMaxEl.value);
        
        // EV/Hybrid parameters
        const powEMotorEl = document.getElementById('pow_e_motor');
        const etaEMotorEl = document.getElementById('eta_e_motor');
        const etaEMotorReEl = document.getElementById('eta_e_motor_re');
        const etaEtcReEl = document.getElementById('eta_etc_re');
        const velMinEMotorEl = document.getElementById('vel_min_e_motor');
        const torqueEMotorMaxEl = document.getElementById('torque_e_motor_max');
        
        if (powEMotorEl && powEMotorEl.value) engine.pow_e_motor = parseFloat(powEMotorEl.value);
        if (etaEMotorEl && etaEMotorEl.value) engine.eta_e_motor = parseFloat(etaEMotorEl.value);
        if (etaEMotorReEl && etaEMotorReEl.value) engine.eta_e_motor_re = parseFloat(etaEMotorReEl.value);
        if (etaEtcReEl && etaEtcReEl.value) engine.eta_etc_re = parseFloat(etaEtcReEl.value);
        if (velMinEMotorEl && velMinEMotorEl.value) engine.vel_min_e_motor = parseFloat(velMinEMotorEl.value);
        if (torqueEMotorMaxEl && torqueEMotorMaxEl.value) engine.torque_e_motor_max = parseFloat(torqueEMotorMaxEl.value);
        
        // Gearbox params - collect all gears
        const iTrans = [];
        const nShift = [];
        const eI = [];
        let gearIndex = 0;
        while (document.getElementById(`i_trans_${gearIndex}`)) {
            iTrans.push(parseFloat(document.getElementById(`i_trans_${gearIndex}`).value));
            nShift.push(parseFloat(document.getElementById(`n_shift_${gearIndex}`).value));
            eI.push(parseFloat(document.getElementById(`e_i_${gearIndex}`).value));
            gearIndex++;
        }
        
        const gearbox = {
            i_trans: iTrans,
            n_shift: nShift,
            e_i: eI,
            eta_g: parseFloat(document.getElementById('eta_g').value)
        };
        
        // Tire params
        const tires = {
            f: {
                circ_ref: parseFloat(document.getElementById('tire_f_circ_ref').value),
                fz_0: parseFloat(document.getElementById('tire_f_fz_0').value),
                mux: parseFloat(document.getElementById('tire_f_mux').value),
                muy: parseFloat(document.getElementById('tire_f_muy').value),
                dmux_dfz: parseFloat(document.getElementById('tire_f_dmux_dfz').value),
                dmuy_dfz: parseFloat(document.getElementById('tire_f_dmuy_dfz').value)
            },
            r: {
                circ_ref: parseFloat(document.getElementById('tire_r_circ_ref').value),
                fz_0: parseFloat(document.getElementById('tire_r_fz_0').value),
                mux: parseFloat(document.getElementById('tire_r_mux').value),
                muy: parseFloat(document.getElementById('tire_r_muy').value),
                dmux_dfz: parseFloat(document.getElementById('tire_r_dmux_dfz').value),
                dmuy_dfz: parseFloat(document.getElementById('tire_r_dmuy_dfz').value)
            },
            tire_model_exp: parseFloat(document.getElementById('tire_model_exp').value)
        };
        
        if (isNew) {
            return {
                profile_id: profileId,
                name: name,
                veh_pars: {
                    powertrain_type: powertrainType,
                    general: general,
                    engine: engine,
                    gearbox: gearbox,
                    tires: tires
                }
            };
        } else {
            return {
                name: name,
                veh_pars: {
                    powertrain_type: powertrainType,
                    general: general,
                    engine: engine,
                    gearbox: gearbox,
                    tires: tires
                }
            };
        }
    }

    getDefaultProfile() {
        return {
            profile_id: '',
            name: '',
            veh_pars: {
                powertrain_type: 'electric',
                general: {
                    lf: 1.906,
                    lr: 1.194,
                    h_cog: 0.345,
                    sf: 1.3,
                    sr: 1.3,
                    m: 880.0,
                    f_roll: 0.02,
                    c_w_a: 1.15,
                    c_z_a_f: 1.24,
                    c_z_a_r: 1.52,
                    g: 9.81,
                    rho_air: 1.18,
                    drs_factor: 0.0
                },
                engine: {
                    topology: 'RWD',
                    pow_e_motor: 200000.0,
                    eta_e_motor: 0.9,
                    eta_e_motor_re: 0.9,
                    eta_etc_re: 0.10,
                    vel_min_e_motor: 27.777,
                    torque_e_motor_max: 150.0
                },
                gearbox: {
                    i_trans: [0.056, 0.091],
                    n_shift: [19000.0, 19000.0],
                    e_i: [1.04, 1.04],
                    eta_g: 0.96
                },
                tires: {
                    f: {
                        circ_ref: 2.168,
                        fz_0: 2500.0,
                        mux: 1.22,
                        muy: 1.22,
                        dmux_dfz: -2.5e-5,
                        dmuy_dfz: -2.5e-5
                    },
                    r: {
                        circ_ref: 2.168,
                        fz_0: 2500.0,
                        mux: 1.42,
                        muy: 1.42,
                        dmux_dfz: -2.0e-5,
                        dmuy_dfz: -2.0e-5
                    },
                    tire_model_exp: 2.0
                }
            }
        };
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showError(message) {
        // Simple error notification - can be enhanced
        alert(`Error: ${message}`);
    }

    showSuccess(message) {
        // Simple success notification - can be enhanced
        alert(`Success: ${message}`);
    }
}

