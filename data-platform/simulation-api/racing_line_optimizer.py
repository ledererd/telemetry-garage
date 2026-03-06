"""
Racing Line Optimizer
Implements algorithms to find the optimal racing line around a track.
"""

import numpy as np
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt
from scipy.optimize import minimize
from scipy.interpolate import interp1d
from scipy.ndimage import gaussian_filter1d
import csv
import io
from typing import List, Tuple


class RacingLineOptimizer:
    """
    Optimizes the racing line for a given track and vehicle parameters.
    """
    
    def __init__(self, track_points: List[List[float]], car_profile):
        """
        Initialize the optimizer.
        
        Args:
            track_points: List of [x_m, y_m, w_tr_right_m, w_tr_left_m] for each point
            car_profile: Car profile data structure with vehicle parameters
        """
        self.track_points = np.array(track_points)
        self.car_profile = car_profile
        
        # Extract track data
        self.x_center = self.track_points[:, 0]
        self.y_center = self.track_points[:, 1]
        self.width_right = self.track_points[:, 2]
        self.width_left = self.track_points[:, 3]
        
        # Calculate track boundaries
        self._calculate_track_boundaries()
        
        # Vehicle parameters
        self.mass = car_profile.general.m
        self.max_lateral_g = self._estimate_max_lateral_g()
        
    def _calculate_track_boundaries(self):
        """Calculate left and right track boundaries."""
        n_points = len(self.x_center)
        
        # Calculate direction vectors along the track
        dx = np.diff(self.x_center)
        dy = np.diff(self.y_center)
        ds = np.sqrt(dx**2 + dy**2)
        
        # Normalize direction vectors
        dx_norm = np.zeros(n_points)
        dy_norm = np.zeros(n_points)
        dx_norm[:-1] = dx / (ds + 1e-10)
        dy_norm[:-1] = dy / (ds + 1e-10)
        dx_norm[-1] = dx_norm[-2]  # Extend last point
        dy_norm[-1] = dy_norm[-2]
        
        # Perpendicular vectors (rotate 90 degrees)
        perp_x = -dy_norm
        perp_y = dx_norm
        
        # Calculate boundary points
        self.x_right = self.x_center + perp_x * self.width_right
        self.y_right = self.y_center + perp_y * self.width_right
        self.x_left = self.x_center - perp_x * self.width_left
        self.y_left = self.y_center - perp_y * self.width_left
        
    def _estimate_max_lateral_g(self) -> float:
        """Estimate maximum lateral G-force based on tire parameters."""
        # Use the minimum of front and rear tire friction coefficients
        mu_f = self.car_profile.tires.f.muy
        mu_r = self.car_profile.tires.r.muy
        mu_min = min(mu_f, mu_r)
        
        # Maximum lateral acceleration is approximately mu * g
        # Add some safety margin
        return mu_min * 0.9
    
    def _calculate_curvature(self, x: np.ndarray, y: np.ndarray) -> np.ndarray:
        """Calculate curvature along a path."""
        n = len(x)
        if n < 3:
            return np.zeros(n)
        
        # First derivatives
        dx = np.gradient(x)
        dy = np.gradient(y)
        
        # Second derivatives
        ddx = np.gradient(dx)
        ddy = np.gradient(dy)
        
        # Curvature: k = |x'y'' - y'x''| / (x'^2 + y'^2)^(3/2)
        numerator = np.abs(dx * ddy - dy * ddx)
        denominator = (dx**2 + dy**2)**1.5
        denominator = np.maximum(denominator, 1e-10)  # Avoid division by zero
        
        curvature = numerator / denominator
        return curvature
    
    def _calculate_speed_profile(self, curvature: np.ndarray) -> np.ndarray:
        """Calculate speed profile based on curvature and vehicle limits."""
        # Minimum radius based on maximum lateral G
        g = 9.81
        v_min_squared = curvature * g / (self.max_lateral_g + 1e-10)
        v_min = np.sqrt(np.maximum(v_min_squared, 0))
        
        # Start with minimum speeds
        speeds = v_min.copy()
        
        # Forward pass: accelerate where possible
        for i in range(1, len(speeds)):
            # Maximum acceleration (simplified)
            max_accel = 5.0  # m/s^2
            dt = 0.1  # Assume small time step
            v_max = speeds[i-1] + max_accel * dt
            
            # Don't exceed speed limit based on curvature
            speeds[i] = min(speeds[i], v_max)
        
        # Backward pass: decelerate where necessary
        for i in range(len(speeds) - 2, -1, -1):
            # Maximum deceleration
            max_decel = 8.0  # m/s^2
            dt = 0.1
            v_max = speeds[i+1] + max_decel * dt
            
            speeds[i] = min(speeds[i], v_max)
        
        # Apply minimum speed
        speeds = np.maximum(speeds, 5.0)  # Minimum 5 m/s
        
        return speeds
    
    def _objective_function(self, offsets: np.ndarray) -> float:
        """
        Objective function to minimize: total lap time with smoothness penalty.
        
        The key insight: wider arcs (lower curvature) allow higher speeds.
        We want to minimize curvature to maximize speed through corners.
        
        Args:
            offsets: Array of lateral offsets from centerline (positive = right, negative = left)
        
        Returns:
            Total lap time + penalties to minimize
        """
        # Calculate racing line from offsets
        n = len(self.x_center)
        perp_x = np.zeros(n)
        perp_y = np.zeros(n)
        
        # Calculate perpendicular vectors
        dx = np.diff(self.x_center)
        dy = np.diff(self.y_center)
        ds = np.sqrt(dx**2 + dy**2)
        dx_norm = dx / (ds + 1e-10)
        dy_norm = dy / (ds + 1e-10)
        
        # Perpendicular (rotate 90 degrees)
        perp_x[:-1] = -dy_norm
        perp_y[:-1] = dx_norm
        perp_x[-1] = perp_x[-2]
        perp_y[-1] = perp_y[-2]
        
        # Calculate racing line
        x_line = self.x_center + perp_x * offsets
        y_line = self.y_center + perp_y * offsets
        
        # Smooth penalty for going off track (instead of hard cutoff)
        boundary_penalty = 0.0
        for i in range(n):
            offset = offsets[i]
            # Soft penalty that increases as we approach boundaries
            if offset > self.width_right[i]:
                excess = offset - self.width_right[i]
                boundary_penalty += 1000.0 * excess * excess
            elif offset < -self.width_left[i]:
                excess = -self.width_left[i] - offset
                boundary_penalty += 1000.0 * excess * excess
        
        # Calculate curvature
        curvature = self._calculate_curvature(x_line, y_line)
        
        # Penalty for high curvature (encourages wider arcs)
        # This is key: we want to minimize curvature to maximize speed
        # Use a much stronger penalty, especially in corners
        # Weight by curvature so corners get more penalty
        curvature_weights = np.maximum(curvature, 0.01)  # Minimum weight even in straights
        curvature_penalty = np.sum((curvature ** 2) * curvature_weights) * 200.0
        
        # Smoothness penalty: penalize rapid changes in curvature
        # This ensures smooth transitions between corners
        if len(curvature) > 1:
            curvature_change = np.abs(np.diff(curvature))
            smoothness_penalty = np.sum(curvature_change ** 2) * 50.0
        else:
            smoothness_penalty = 0.0
        
        # Explicitly reward wider arcs in corners by penalizing tight corners
        # For each corner, calculate the effective radius and penalize small radius
        # Also reward using track width - penalize staying too close to centerline
        arc_radius_penalty = 0.0
        track_width_usage_penalty = 0.0
        for i in range(n):
            # Lower threshold to catch high-speed corners (which have lower curvature)
            if curvature[i] > 0.01:  # In a corner (lowered to catch high-speed corners)
                # Calculate effective radius (1/curvature)
                radius = 1.0 / (curvature[i] + 1e-10)
                # Penalize small radius (tight corners)
                # Target radius should be large (use track width as reference)
                target_radius = (self.width_right[i] + self.width_left[i]) * 2.0
                if radius < target_radius:
                    arc_radius_penalty += (target_radius - radius) * 10.0
                
                # Reward using track width: penalize staying too close to centerline
                # This is especially important for high-speed corners (low curvature)
                abs_offset = abs(offsets[i])
                available_width = self.width_right[i] + self.width_left[i]
                width_usage_ratio = abs_offset / (available_width * 0.5 + 1e-10)  # Normalize to 0-1
                
                # For high-speed corners (low curvature), we need to use full width
                # For low-speed corners (high curvature), we can hit apex tighter
                is_high_speed_corner = curvature[i] < 0.05  # High-speed if curvature < 0.05
                
                if is_high_speed_corner:
                    # For high-speed corners, strongly penalize low width usage
                    # These corners need wide arcs to maximize speed
                    if width_usage_ratio < 0.7:  # Using less than 70% of available width
                        # Stronger penalty for high-speed corners
                        # Lower curvature = higher speed = more important to use width
                        corner_speed_factor = 1.0 / (curvature[i] + 0.001)  # Higher for lower curvature
                        track_width_usage_penalty += (0.7 - width_usage_ratio) * 10.0 * min(corner_speed_factor, 15.0)
                # For low-speed corners, allow tighter apex hits (no penalty for low width usage)
        
        # Calculate speed profile (wider arcs = lower curvature = higher speed)
        speeds = self._calculate_speed_profile(curvature)
        
        # Calculate distances
        dx_line = np.diff(x_line)
        dy_line = np.diff(y_line)
        ds_line = np.sqrt(dx_line**2 + dy_line**2)
        
        # Calculate time
        dt = ds_line / (speeds[:-1] + 1e-10)
        total_time = np.sum(dt)
        
        # Total objective: minimize time while encouraging smooth, wide arcs
        # The penalties should dominate in corners to ensure wide arcs
        return total_time + boundary_penalty + curvature_penalty + smoothness_penalty + arc_radius_penalty + track_width_usage_penalty
    
    def optimize(self) -> np.ndarray:
        """
        Optimize the racing line.
        
        Returns:
            Array of [x, y] coordinates for the optimal racing line
        """
        n = len(self.x_center)
        
        # Initial guess: slightly offset from centerline based on curvature
        # For corners, use a simple heuristic: take wider line (late apex)
        initial_offsets = np.zeros(n)
        
        # Calculate initial curvature to inform initial guess
        curvature = self._calculate_curvature(self.x_center, self.y_center)
        
        # Calculate turn direction by looking at cross product of consecutive segments
        # Use wider initial offsets to encourage wider arcs from the start
        # Use more aggressive initial guess for high-speed corners
        for i in range(1, n-1):
            # Lower threshold to catch high-speed corners
            if curvature[i] > 0.003:  # Significant curvature (lowered to catch high-speed corners)
                # Determine turn direction
                dx1 = self.x_center[i] - self.x_center[i-1]
                dy1 = self.y_center[i] - self.y_center[i-1]
                dx2 = self.x_center[i+1] - self.x_center[i]
                dy2 = self.y_center[i+1] - self.y_center[i]
                
                # Cross product to determine turn direction (positive = left turn)
                cross = dx1 * dy2 - dy1 * dx2
                
                # For left turns (positive cross), go right (positive offset)
                # For right turns (negative cross), go left (negative offset)
                # Use more width for high-speed corners (low curvature)
                # High-speed corners need wider arcs, so use more of the track
                if curvature[i] < 0.05:  # High-speed corner
                    width_factor = 0.75  # Use 75% of width for high-speed corners
                else:  # Low-speed corner
                    width_factor = 0.9  # Use 50% for low-speed corners
                
                if cross > 0:
                    # Left turn - start on right side (wider arc)
                    initial_offsets[i] = width_factor * self.width_right[i]
                else:
                    # Right turn - start on left side (wider arc)
                    initial_offsets[i] = -width_factor * self.width_left[i]
        
        # Smooth the initial guess to avoid sharp transitions.  High number here means more smoothing.
        initial_offsets = gaussian_filter1d(initial_offsets, sigma=3.0)  
        
        # Bounds: can't go beyond track boundaries (with small margin for safety)
        bounds = [(-self.width_left[i] * 0.95, self.width_right[i] * 0.95) for i in range(n)]
        
        # Try optimization with different methods if first fails
        optimal_offsets = None
        result = None
        
        # First try: L-BFGS-B (fast, good for smooth functions)
        try:
            result = minimize(
                self._objective_function,
                initial_offsets,
                method='L-BFGS-B',
                bounds=bounds,
                options={'maxiter': 5000, 'ftol': 1e-5, 'gtol': 1e-4}
            )
            if result.success:
                optimal_offsets = result.x
                print(f"L-BFGS-B optimization succeeded: {result.nit} iterations, final time: {result.fun:.2f}s")
            else:
                print(f"L-BFGS-B optimization did not converge: {result.message}")
        except Exception as e:
            print(f"L-BFGS-B optimization failed: {e}")
        
        # Fallback: SLSQP (more robust, handles constraints better)
        if optimal_offsets is None:
            try:
                result = minimize(
                    self._objective_function,
                    initial_offsets,
                    method='SLSQP',
                    bounds=bounds,
                    options={'maxiter': 2000, 'ftol': 1e-5}
                )
                if result.success:
                    optimal_offsets = result.x
                    print(f"SLSQP optimization succeeded: {result.nit} iterations, final time: {result.fun:.2f}s")
                else:
                    print(f"SLSQP optimization did not converge: {result.message}")
            except Exception as e:
                print(f"SLSQP optimization failed: {e}")
        
        # Final fallback: Use centerline with slight smoothing
        if optimal_offsets is None:
            print(f"Warning: Optimization did not converge. Using centerline.")
            optimal_offsets = np.zeros(n)
        else:
            # Light smoothing to ensure smooth transitions, but preserve the wide arcs
            # Use minimal smoothing to preserve the optimized wide arcs
            optimal_offsets = gaussian_filter1d(optimal_offsets, sigma=1.0)
            
            # Check if we actually optimized (not just centerline)
            max_offset = np.max(np.abs(optimal_offsets))
            avg_offset = np.mean(np.abs(optimal_offsets))
            
            if max_offset < 0.1:
                print(f"Warning: Optimization resulted in near-centerline (max offset: {max_offset:.3f}m)")
            else:
                print(f"Optimization successful: max offset: {max_offset:.3f}m, avg offset: {avg_offset:.3f}m")
                
                # Verify the line uses track width effectively
                # Calculate final curvature to verify we got wider arcs
                perp_x = np.zeros(n)
                perp_y = np.zeros(n)
                dx = np.diff(self.x_center)
                dy = np.diff(self.y_center)
                ds = np.sqrt(dx**2 + dy**2)
                dx_norm = dx / (ds + 1e-10)
                dy_norm = dy / (ds + 1e-10)
                perp_x[:-1] = -dy_norm
                perp_y[:-1] = dx_norm
                perp_x[-1] = perp_x[-2]
                perp_y[-1] = perp_y[-2]
                
                x_final = self.x_center + perp_x * optimal_offsets
                y_final = self.y_center + perp_y * optimal_offsets
                final_curvature = self._calculate_curvature(x_final, y_final)
                center_curvature = self._calculate_curvature(self.x_center, self.y_center)
                
                # Check if we reduced curvature (wider arcs)
                curvature_reduction = np.sum(center_curvature) - np.sum(final_curvature)
                if curvature_reduction > 0:
                    print(f"Curvature reduced by {curvature_reduction:.4f} (wider arcs achieved)")
                else:
                    print(f"Warning: Curvature not reduced, may need stronger penalties")
        
        # Calculate final racing line
        dx = np.diff(self.x_center)
        dy = np.diff(self.y_center)
        ds = np.sqrt(dx**2 + dy**2)
        dx_norm = dx / (ds + 1e-10)
        dy_norm = dy / (ds + 1e-10)
        
        perp_x = np.zeros(n)
        perp_y = np.zeros(n)
        perp_x[:-1] = -dy_norm
        perp_y[:-1] = dx_norm
        perp_x[-1] = perp_x[-2]
        perp_y[-1] = perp_y[-2]
        
        x_optimal = self.x_center + perp_x * optimal_offsets
        y_optimal = self.y_center + perp_y * optimal_offsets
        
        # Return as array of [x, y] pairs
        racing_line = np.column_stack([x_optimal, y_optimal])
        
        return racing_line
    
    def generate_plot(self, racing_line: np.ndarray, track_points: List[List[float]]) -> bytes:
        """
        Generate a plot of the racing line.
        
        Args:
            racing_line: Array of [x, y] coordinates for the racing line
            track_points: Original track points
        
        Returns:
            PNG image as bytes
        """
        # Increase figure size and DPI for higher resolution
        fig, ax = plt.subplots(figsize=(20, 18), dpi=300)
        
        # Plot track boundaries (thicker lines for high resolution)
        ax.plot(self.x_right, self.y_right, 'k-', linewidth=0.5, label='Track Right')
        ax.plot(self.x_left, self.y_left, 'k-', linewidth=0.5, label='Track Left')
        ax.plot(self.x_center, self.y_center, 'b--', linewidth=1.0, alpha=0.5, label='Centerline')
        
        # Plot racing line (thicker for visibility at high resolution)
        ax.plot(racing_line[:, 0], racing_line[:, 1], 'r-', linewidth=1, label='Optimal Racing Line')
        
        # Mark start/finish (larger marker for high resolution)
        ax.plot(racing_line[0, 0], racing_line[0, 1], 'go', markersize=15, label='Start/Finish')
        
        ax.set_aspect('equal')
        ax.grid(True, alpha=0.3, linewidth=0.5)
        ax.legend(fontsize=12)
        ax.set_xlabel('X (m)', fontsize=14)
        ax.set_ylabel('Y (m)', fontsize=14)
        #ax.set_title('Optimal Racing Line', fontsize=16, fontweight='bold')
        
        # Increase tick label size for better readability at high resolution
        ax.tick_params(labelsize=11)
        
        # Save to bytes with high DPI
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=300, bbox_inches='tight', facecolor='white')
        buf.seek(0)
        plot_bytes = buf.read()
        buf.close()
        plt.close(fig)
        
        return plot_bytes
    
    def generate_csv(self, racing_line: np.ndarray) -> str:
        """
        Generate CSV file with racing line coordinates for driver training.
        
        Args:
            racing_line: Array of [x, y] coordinates for the racing line
        
        Returns:
            CSV content as string
        """
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header
        writer.writerow(['x_m', 'y_m', 'distance_m', 'curvature_1_m', 'speed_m_s'])
        
        # Calculate cumulative distance
        dx = np.diff(racing_line[:, 0])
        dy = np.diff(racing_line[:, 1])
        ds = np.sqrt(dx**2 + dy**2)
        cumulative_distance = np.concatenate([[0], np.cumsum(ds)])
        
        # Calculate curvature
        curvature = self._calculate_curvature(racing_line[:, 0], racing_line[:, 1])
        
        # Calculate speed profile
        speeds = self._calculate_speed_profile(curvature)
        
        # Write data
        for i in range(len(racing_line)):
            writer.writerow([
                f"{racing_line[i, 0]:.6f}",
                f"{racing_line[i, 1]:.6f}",
                f"{cumulative_distance[i]:.6f}",
                f"{curvature[i]:.6f}",
                f"{speeds[i]:.6f}"
            ])
        
        csv_content = output.getvalue()
        output.close()
        
        return csv_content
