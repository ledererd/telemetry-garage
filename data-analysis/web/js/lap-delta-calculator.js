/**
 * Lap delta: compare elapsed time vs distance between two laps.
 * Positive delta = slower than reference; negative = faster.
 */

class LapDeltaCalculator {
    /**
     * Elapsed time within lap (seconds) from lap_time or timestamp vs lap start.
     */
    static getElapsedSeconds(record, firstTimestampMs) {
        if (record.lap_time != null && record.lap_time !== undefined && !Number.isNaN(Number(record.lap_time))) {
            return Number(record.lap_time);
        }
        const t = new Date(record.timestamp).getTime();
        return (t - firstTimestampMs) / 1000;
    }

    /**
     * Add distance and elapsed to each record (mutates copies).
     */
    static prepareLapData(records) {
        if (!records || records.length === 0) {
            return [];
        }
        const withDist = DistanceCalculator.calculateCumulativeDistance(records);
        const firstTs = new Date(withDist[0].timestamp).getTime();
        return withDist.map((r) => ({
            ...r,
            distance: r.distance != null ? r.distance : 0,
            elapsed: this.getElapsedSeconds(r, firstTs),
        }));
    }

    /**
     * Linear interpolation: elapsed time on reference lap at given distance (meters).
     */
    static interpolateElapsed(referencePrepared, distanceMeters) {
        const ref = referencePrepared;
        if (ref.length === 0) {
            return null;
        }
        const d = distanceMeters;
        if (d <= ref[0].distance) {
            return ref[0].elapsed;
        }
        const last = ref[ref.length - 1];
        if (d >= last.distance) {
            return last.elapsed;
        }
        for (let i = 1; i < ref.length; i++) {
            if (d <= ref[i].distance) {
                const d0 = ref[i - 1].distance;
                const t0 = ref[i - 1].elapsed;
                const d1 = ref[i].distance;
                const t1 = ref[i].elapsed;
                if (d1 === d0) {
                    return t0;
                }
                return t0 + ((t1 - t0) * (d - d0)) / (d1 - d0);
            }
        }
        return last.elapsed;
    }

    /**
     * Map delta (seconds) to RGB color for track segments.
     * Negative (faster) = green; positive (slower) = red; near zero = neutral.
     */
    static deltaToColor(deltaSeconds) {
        const maxAbs = 0.5;
        const t = Math.max(-1, Math.min(1, deltaSeconds / maxAbs));
        if (t <= 0) {
            const g = Math.round(120 + 100 * (1 + t));
            const b = Math.round(80 + 40 * (1 + t));
            return `rgb(40, ${g}, ${b})`;
        }
        const r = Math.round(180 + 60 * t);
        const gb = Math.round(100 - 40 * t);
        return `rgb(${r}, ${gb}, ${gb})`;
    }

    /**
     * @param {Array} compareRecords - raw telemetry for compare lap
     * @param {Array} referenceRecords - raw telemetry for reference lap
     * @returns {{
     *   distancesKm: number[],
     *   deltas: number[],
     *   totalDelta: number,
     *   segmentDeltas: number[],
     *   comparableDistanceM: number
     * } | null}
     */
    static computeDelta(compareRecords, referenceRecords) {
        const comp = this.prepareLapData(compareRecords);
        const ref = this.prepareLapData(referenceRecords);
        if (comp.length === 0 || ref.length === 0) {
            return null;
        }

        const maxD = Math.min(comp[comp.length - 1].distance, ref[ref.length - 1].distance);
        if (maxD <= 0) {
            return null;
        }

        const distancesKm = [];
        const deltas = [];

        for (let i = 0; i < comp.length; i++) {
            const d = comp[i].distance;
            if (d > maxD) {
                break;
            }
            const tRef = this.interpolateElapsed(ref, d);
            if (tRef === null) {
                continue;
            }
            const delta = comp[i].elapsed - tRef;
            deltas.push(delta);
            distancesKm.push(DistanceCalculator.metersToKilometers(d));
        }

        if (deltas.length === 0) {
            return null;
        }

        const totalDelta = deltas[deltas.length - 1];
        const segmentDeltas = [];
        for (let i = 0; i < comp.length - 1; i++) {
            const dMid = (comp[i].distance + comp[i + 1].distance) / 2;
            if (dMid > maxD) {
                segmentDeltas.push(0);
                continue;
            }
            const tRefMid = this.interpolateElapsed(ref, dMid);
            if (tRefMid === null) {
                segmentDeltas.push(0);
                continue;
            }
            const elapsedMid = (comp[i].elapsed + comp[i + 1].elapsed) / 2;
            segmentDeltas.push(elapsedMid - tRefMid);
        }

        return {
            distancesKm,
            deltas,
            totalDelta,
            segmentDeltas,
            comparableDistanceM: maxD,
        };
    }
}
