/**
 * G–G diagram (friction circle): lateral vs longitudinal acceleration.
 * Longitudinal: acceleration positive, braking negative (vehicle_dynamics convention).
 */

const GG_DIAGRAM = {
    MAX_POINTS: 8000,

    /**
     * Points on a circle in the G–G plane (x = lateral, y = longitudinal; top-down car view).
     */
    buildCirclePoints(radiusG, steps = 72) {
        const data = [];
        for (let i = 0; i <= steps; i++) {
            const t = (i / steps) * 2 * Math.PI;
            data.push({ x: radiusG * Math.cos(t), y: radiusG * Math.sin(t) });
        }
        return data;
    },

    /**
     * Reference circle radii (g) to draw when within axis range.
     */
    REFERENCE_RADII: [0.25, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0],

    extractScatterPoints(records) {
        if (!records || records.length === 0) return null;
        const stride = Math.max(1, Math.ceil(records.length / GG_DIAGRAM.MAX_POINTS));
        const points = [];
        for (let i = 0; i < records.length; i += stride) {
            const vd = records[i].vehicle_dynamics || {};
            const x = vd.lateral_g;
            const y = vd.longitudinal_g;
            if (x == null || y == null) continue;
            const nx = Number(x);
            const ny = Number(y);
            if (Number.isNaN(nx) || Number.isNaN(ny)) continue;
            points.push({ x: nx, y: ny });
        }
        return points.length > 0 ? points : null;
    },

    symmetricLimitFromPoints(points) {
        let maxR = 0.25;
        for (const p of points) {
            const r = Math.sqrt(p.x * p.x + p.y * p.y);
            if (r > maxR) maxR = r;
        }
        const padded = Math.ceil(maxR * 1.12 * 20) / 20;
        return Math.max(0.5, Math.min(padded, 4));
    },
};
