"""
Lap Time Calculator
Calculates lap time based on racing line and vehicle parameters.
"""

import numpy as np
from typing import List, Tuple


class LapTimeCalculator:
    """
    Calculates lap time for a given racing line and vehicle profile.
    """
    
    def __init__(self, track_points: List[List[float]], car_profile):
        """
        Initialize the calculator.
        
        Args:
            track_points: List of [x_m, y_m, w_tr_right_m, w_tr_left_m] for each point
            car_profile: Car profile data structure with vehicle parameters
        """
        self.track_points = np.array(track_points)
        self.car_profile = car_profile
        
        # Vehicle parameters
        self.mass = car_profile.general.m
        self.rho_air = car_profile.general.rho_air
        self.c_w_a = car_profile.general.c_w_a
        self.c_z_a_f = car_profile.general.c_z_a_f  # Front downforce coefficient
        self.c_z_a_r = car_profile.general.c_z_a_r  # Rear downforce coefficient
        self.f_roll = car_profile.general.f_roll
        self.g = car_profile.general.g
        self.drs_factor = car_profile.general.drs_factor  # DRS drag reduction factor (0-1)
        
        # Powertrain parameters
        # For electric: use pow_e_motor
        # For ICE: use pow_max
        # For hybrid: use pow_max + pow_e_motor (combined power)
        self.max_power = 0.0
        power_sources = []
        
        if car_profile.engine.pow_max is not None:
            self.max_power += car_profile.engine.pow_max
            power_sources.append(f"ICE: {car_profile.engine.pow_max/1000:.1f}kW")
        
        if car_profile.engine.pow_e_motor is not None:
            self.max_power += car_profile.engine.pow_e_motor
            power_sources.append(f"Electric: {car_profile.engine.pow_e_motor/1000:.1f}kW")
        
        if self.max_power == 0.0:
            # Fallback: assume 500kW if not specified
            self.max_power = 500000.0
            print(f"Warning: No power specified, using default {self.max_power}W")
        else:
            print(f"Total power: {self.max_power/1000:.1f}kW ({', '.join(power_sources)})")
        
        self.max_torque = car_profile.engine.torque_e_motor_max if car_profile.engine.torque_e_motor_max is not None else None
        self.eta_motor = car_profile.engine.eta_e_motor if car_profile.engine.eta_e_motor is not None else 1.0
        
        # Tire parameters
        self.mu_f = car_profile.tires.f.mux
        self.mu_r = car_profile.tires.r.mux
        self.mu_avg = (self.mu_f + self.mu_r) / 2.0
        
        # Gearbox
        self.gear_ratios = car_profile.gearbox.i_trans
        self.shift_rpm = car_profile.gearbox.n_shift
        self.gearbox_eta = car_profile.gearbox.eta_g  # Gearbox efficiency
        self.tire_circumference = car_profile.tires.f.circ_ref  # Use front tire
        
    def _calculate_curvature(self, x: np.ndarray, y: np.ndarray) -> np.ndarray:
        """Calculate curvature along a path."""
        n = len(x)
        if n < 3:
            return np.zeros(n)
        
        dx = np.gradient(x)
        dy = np.gradient(y)
        ddx = np.gradient(dx)
        ddy = np.gradient(dy)
        
        numerator = np.abs(dx * ddy - dy * ddx)
        denominator = (dx**2 + dy**2)**1.5
        denominator = np.maximum(denominator, 1e-10)
        
        curvature = numerator / denominator
        return curvature
    
    def _calculate_forces(self, speed: float, curvature: float, drs_active: bool = False) -> Tuple[float, float]:
        """
        Calculate available forces at a given speed and curvature.
        
        Args:
            speed: Current speed [m/s]
            curvature: Path curvature [1/m]
            drs_active: Whether DRS is active (reduces drag)
        
        Returns:
            (longitudinal_force, lateral_force)
        """
        # Air resistance (drag)
        # DRS reduces drag: F_drag = 0.5 * rho * c_w_a * (1 - drs_factor) * v^2 when DRS is active
        if drs_active and self.drs_factor > 0:
            effective_c_w_a = self.c_w_a * (1.0 - self.drs_factor)
        else:
            effective_c_w_a = self.c_w_a
        F_air = 0.5 * self.rho_air * effective_c_w_a * speed**2
        
        # Rolling resistance
        F_roll = self.f_roll * self.mass * self.g
        
        # Calculate aerodynamic downforce
        # Downforce increases with speed squared
        F_downforce = 0.5 * self.rho_air * (self.c_z_a_f + self.c_z_a_r) * speed**2
        
        # Effective normal force = weight + downforce
        # This increases tire grip at higher speeds
        F_normal = self.mass * self.g + F_downforce
        
        # Maximum lateral force (based on tire friction with downforce)
        # More downforce = more grip = higher cornering speeds
        F_lateral_max = self.mu_avg * F_normal
        
        # Lateral force required for cornering
        if curvature > 1e-10:
            radius = 1.0 / curvature
            F_lateral_required = self.mass * speed**2 / radius
        else:
            F_lateral_required = 0.0
        
        # Check if we exceed lateral grip
        if F_lateral_required > F_lateral_max:
            # Reduce speed to stay within grip limits
            # Need to solve: mu * (m*g + 0.5*rho*(c_z_a_f+c_z_a_r)*v^2) = m*v^2/r
            # Rearranging: mu*m*g = v^2 * (m/r - mu*0.5*rho*(c_z_a_f+c_z_a_r))
            aero_coeff = 0.5 * self.rho_air * (self.c_z_a_f + self.c_z_a_r)
            denominator = self.mass / radius - self.mu_avg * aero_coeff
            if denominator > 1e-10:
                v_max_corner_squared = self.mu_avg * self.mass * self.g / denominator
                v_max_corner = np.sqrt(max(0, v_max_corner_squared))
            else:
                # Fallback: use iterative approach
                v_est = speed
                for _ in range(5):
                    F_downforce = 0.5 * self.rho_air * (self.c_z_a_f + self.c_z_a_r) * v_est**2
                    F_normal = self.mass * self.g + F_downforce
                    v_est = np.sqrt(self.mu_avg * F_normal * radius / self.mass)
                v_max_corner = v_est
            speed = min(speed, v_max_corner)
            # Recalculate with new speed
            F_downforce = 0.5 * self.rho_air * (self.c_z_a_f + self.c_z_a_r) * speed**2
            F_normal = self.mass * self.g + F_downforce
            F_lateral_max = self.mu_avg * F_normal
            F_lateral_required = min(F_lateral_required, F_lateral_max)
        
        # Available longitudinal force (friction circle)
        # Use simplified friction circle model with downforce-enhanced grip
        F_total_max = self.mu_avg * F_normal
        F_longitudinal_max_squared = F_total_max**2 - F_lateral_required**2
        F_longitudinal_max = np.sqrt(max(0, F_longitudinal_max_squared))
        
        # Power-limited force
        # P = F * v, so F = P / v
        # But account for efficiency losses
        # Also account for gearbox efficiency
        if speed > 0:
            # Available power at wheels (accounting for motor and gearbox efficiency)
            # For ICE, efficiency is typically already in pow_max, but apply gearbox efficiency
            # For electric, apply both motor and gearbox efficiency
            if hasattr(self, 'gearbox_eta'):
                total_efficiency = self.eta_motor * self.gearbox_eta
            else:
                total_efficiency = self.eta_motor
            P_available = self.max_power * total_efficiency
            F_power = P_available / speed
        else:
            F_power = 1e10
        
        # Available force is minimum of grip-limited and power-limited
        F_longitudinal_available = min(F_longitudinal_max, F_power)
        
        # Net force after drag
        F_net = F_longitudinal_available - F_air - F_roll
        
        return F_net, F_lateral_required
    
    def _calculate_acceleration(self, speed: float, curvature: float, drs_active: bool = False) -> float:
        """Calculate acceleration at a given speed and curvature."""
        F_net, _ = self._calculate_forces(speed, curvature, drs_active)
        acceleration = F_net / self.mass
        return acceleration
    
    def _should_activate_drs(self, speed: float, curvature: float, distance_along_track: float = 0.0) -> bool:
        """
        Determine if DRS should be activated.
        
        DRS is typically activated:
        - On straights (low curvature)
        - At high speeds
        - In designated DRS zones (not implemented yet, but can be added)
        
        For now, use a simple heuristic: activate on straights at high speed.
        """
        # DRS typically activates above ~100 km/h (27.8 m/s) on straights
        min_speed_for_drs = 27.8  # m/s
        max_curvature_for_drs = 0.01  # 1/m (very straight sections)
        
        if speed < min_speed_for_drs:
            return False
        
        if curvature > max_curvature_for_drs:
            return False
        
        # Only activate if DRS factor is significant
        if self.drs_factor <= 0:
            return False
        
        return True
    
    def _calculate_speed_profile(self, racing_line: np.ndarray, initial_speed: float = None) -> np.ndarray:
        """
        Calculate speed profile along the racing line.
        
        Uses forward-backward integration to find optimal speeds.
        
        Args:
            racing_line: Array of [x, y] coordinates for the racing line
            initial_speed: Optional initial speed [m/s]. If None, estimates based on power/drag.
        """
        n = len(racing_line)
        # Initial speed: use provided value, or estimate based on power and mass
        if initial_speed is None:
            # Better initial guess: estimate based on power and mass
            # v_max ≈ sqrt(P_max / (0.5 * rho * c_w_a)) for power-limited top speed
            if self.max_power > 0:
                estimated_top_speed = np.sqrt(self.max_power / (0.5 * self.rho_air * self.c_w_a))
                initial_speed = min(estimated_top_speed * 0.7, 100.0)  # Start at 70% of estimated top speed, max 100 m/s
            else:
                initial_speed = 80.0  # Default: 80 m/s (288 km/h)
        speeds = np.ones(n) * initial_speed
        
        # Calculate curvature
        curvature = self._calculate_curvature(racing_line[:, 0], racing_line[:, 1])
        
        # Calculate cumulative distance along track for DRS zone detection
        cumulative_distance = np.zeros(n)
        for i in range(1, n):
            dx = racing_line[i, 0] - racing_line[i-1, 0]
            dy = racing_line[i, 1] - racing_line[i-1, 1]
            ds = np.sqrt(dx**2 + dy**2)
            cumulative_distance[i] = cumulative_distance[i-1] + ds
        
        # Forward pass: accelerate where possible
        for i in range(1, n):
            # Calculate distance
            dx = racing_line[i, 0] - racing_line[i-1, 0]
            dy = racing_line[i, 1] - racing_line[i-1, 1]
            ds = np.sqrt(dx**2 + dy**2)
            
            if ds < 1e-10:
                speeds[i] = speeds[i-1]
                continue
            
            # Determine if DRS should be active
            drs_active = self._should_activate_drs(speeds[i-1], curvature[i-1], cumulative_distance[i-1])
            
            # Calculate acceleration at current speed
            accel = self._calculate_acceleration(speeds[i-1], curvature[i-1], drs_active)
            
            # Update speed using kinematic equation: v^2 = v0^2 + 2*a*s
            # But acceleration may vary, so use average if significant change
            if accel > 0 and speeds[i-1] > 0:
                # For acceleration, account for power curve (power decreases as speed increases)
                # Use average acceleration over the segment
                v_est = speeds[i-1] + accel * (ds / speeds[i-1])  # Rough estimate
                drs_active_end = self._should_activate_drs(v_est, curvature[i], cumulative_distance[i])
                accel_end = self._calculate_acceleration(v_est, curvature[i], drs_active_end)
                accel_avg = (accel + accel_end) / 2.0
                v_new = np.sqrt(max(0, speeds[i-1]**2 + 2 * accel_avg * ds))
            else:
                # For deceleration or low speed, use simple formula
                v_new = np.sqrt(max(0, speeds[i-1]**2 + 2 * accel * ds))
            
            # Limit by maximum cornering speed (accounting for downforce)
            if curvature[i] > 1e-10:
                radius = 1.0 / curvature[i]
                # Maximum cornering speed with downforce-enhanced grip
                # mu * (m*g + 0.5*rho*(c_z_a_f+c_z_a_r)*v^2) = m*v^2/r
                # Rearranging: mu*m*g = v^2 * (m/r - mu*0.5*rho*(c_z_a_f+c_z_a_r))
                # v^2 = mu*m*g / (m/r - mu*0.5*rho*(c_z_a_f+c_z_a_r))
                aero_coeff = 0.5 * self.rho_air * (self.c_z_a_f + self.c_z_a_r)
                denominator = self.mass / radius - self.mu_avg * aero_coeff
                if denominator > 1e-10:
                    v_max_corner_squared = self.mu_avg * self.mass * self.g / denominator
                    v_max_corner = np.sqrt(max(0, v_max_corner_squared))
                else:
                    # Fallback: downforce term dominates, use iterative approach
                    # Start with no-downforce estimate
                    v_est = np.sqrt(self.mu_avg * self.g * radius)
                    # Iterate a few times to converge
                    for _ in range(5):
                        F_downforce = 0.5 * self.rho_air * (self.c_z_a_f + self.c_z_a_r) * v_est**2
                        F_normal = self.mass * self.g + F_downforce
                        v_est = np.sqrt(self.mu_avg * F_normal * radius / self.mass)
                    v_max_corner = v_est
                v_new = min(v_new, v_max_corner)
            
            speeds[i] = v_new
        
        # Backward pass: decelerate where necessary
        for i in range(n - 2, -1, -1):
            # Calculate distance
            dx = racing_line[i+1, 0] - racing_line[i, 0]
            dy = racing_line[i+1, 1] - racing_line[i, 1]
            ds = np.sqrt(dx**2 + dy**2)
            
            if ds < 1e-10:
                continue
            
            # Determine if DRS should be active (though typically not during braking)
            drs_active = self._should_activate_drs(speeds[i], curvature[i], cumulative_distance[i])
            
            # Calculate deceleration needed
            # v^2 = v0^2 + 2*a*d
            # a = (v^2 - v0^2) / (2*d)
            v_next = speeds[i+1]
            v_current = speeds[i]
            
            if v_current > v_next:
                # Need to decelerate
                decel = (v_next**2 - v_current**2) / (2 * ds)
                
                # Maximum braking force: limited by tire grip and downforce
                # Calculate max deceleration based on available grip
                F_downforce = 0.5 * self.rho_air * (self.c_z_a_f + self.c_z_a_r) * v_current**2
                F_normal = self.mass * self.g + F_downforce
                F_brake_max = self.mu_avg * F_normal  # Maximum braking force
                max_decel = F_brake_max / self.mass  # Maximum deceleration
                
                # F1 cars can brake at 5-6G, but cap at reasonable value
                max_decel = min(max_decel, 50.0)  # Cap at ~5G (50 m/s²)
                
                if abs(decel) > max_decel:
                    # Adjust current speed to achievable deceleration
                    v_current = np.sqrt(v_next**2 + 2 * max_decel * ds)
                    speeds[i] = v_current
            
            # Also check cornering limit (accounting for downforce)
            if curvature[i] > 1e-10:
                radius = 1.0 / curvature[i]
                # Maximum cornering speed with downforce-enhanced grip
                # mu * (m*g + 0.5*rho*(c_z_a_f+c_z_a_r)*v^2) = m*v^2/r
                aero_coeff = 0.5 * self.rho_air * (self.c_z_a_f + self.c_z_a_r)
                denominator = self.mass / radius - self.mu_avg * aero_coeff
                if denominator > 1e-10:
                    v_max_corner_squared = self.mu_avg * self.mass * self.g / denominator
                    v_max_corner = np.sqrt(max(0, v_max_corner_squared))
                else:
                    # Fallback: use iterative approach
                    v_est = speeds[i]
                    for _ in range(5):
                        F_downforce = 0.5 * self.rho_air * (self.c_z_a_f + self.c_z_a_r) * v_est**2
                        F_normal = self.mass * self.g + F_downforce
                        v_est = np.sqrt(self.mu_avg * F_normal * radius / self.mass)
                    v_max_corner = v_est
                speeds[i] = min(speeds[i], v_max_corner)
        
        # Apply minimum speed (but allow lower for very tight corners)
        speeds = np.maximum(speeds, 10.0)  # Minimum 10 m/s (36 km/h) for F1 cars
        
        return speeds
    
    def calculate_lap_time(self, racing_line: np.ndarray, return_speed_profile: bool = False) -> tuple:
        """
        Calculate total lap time for the given racing line.
        
        Uses a two-pass approach for better accuracy:
        1. First pass: uses estimated initial speed based on power/drag
        2. Second pass: uses final speed from first pass as initial speed
           This ensures the start/finish line speed is consistent across the lap.
        
        Args:
            racing_line: Array of [x, y] coordinates for the racing line
            return_speed_profile: If True, also return speed profile data
        
        Returns:
            If return_speed_profile is False: lap time in seconds (float)
            If return_speed_profile is True: (lap_time, speed_profile_dict) where speed_profile_dict contains:
                - distances: cumulative distance along track [m]
                - speeds: speed at each point [m/s]
        """
        # First pass: use estimated initial speed
        speeds_pass1 = self._calculate_speed_profile(racing_line)
        final_speed_pass1 = speeds_pass1[-1]
        
        # Second pass: use final speed from first pass as initial speed
        # This ensures the start/finish line speed is consistent
        speeds = self._calculate_speed_profile(racing_line, initial_speed=final_speed_pass1)
        
        # Calculate distances between points
        dx = np.diff(racing_line[:, 0])
        dy = np.diff(racing_line[:, 1])
        ds = np.sqrt(dx**2 + dy**2)
        
        # Calculate cumulative distance
        cumulative_distance = np.zeros(len(speeds))
        for i in range(1, len(speeds)):
            cumulative_distance[i] = cumulative_distance[i-1] + ds[i-1]
        
        # Calculate time for each segment
        # Use more accurate integration: if acceleration is significant, use average of speeds
        # For better accuracy with varying speeds, use trapezoidal integration
        v_avg = (speeds[:-1] + speeds[1:]) / 2.0
        v_avg = np.maximum(v_avg, 1e-10)  # Avoid division by zero
        
        # Time for each segment: dt = ds / v_avg
        dt = ds / v_avg
        
        # For segments with significant speed change, use more accurate integration
        # If speed change is large relative to average speed, use logarithmic mean
        dv = np.abs(speeds[1:] - speeds[:-1])
        significant_change = dv > 0.1 * v_avg  # More than 10% change
        
        # For significant changes, use more accurate time calculation
        # Using: dt = ds / v_ln where v_ln is logarithmic mean for better accuracy
        for i in range(len(dt)):
            if significant_change[i] and speeds[i] > 0 and speeds[i+1] > 0:
                # Use logarithmic mean for better accuracy with large speed changes
                v_ln = (speeds[i+1] - speeds[i]) / (np.log(speeds[i+1]) - np.log(speeds[i])) if speeds[i+1] != speeds[i] else v_avg[i]
                if v_ln > 0:
                    dt[i] = ds[i] / v_ln
        
        # Total lap time
        total_time = np.sum(dt)
        
        if return_speed_profile:
            speed_profile = {
                "distances": cumulative_distance.tolist(),  # [m]
                "speeds": speeds.tolist()  # [m/s]
            }
            return float(total_time), speed_profile
        else:
            return float(total_time)
