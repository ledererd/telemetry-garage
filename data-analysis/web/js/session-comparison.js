/**
 * Session A vs Session B comparison (best lap or full session without out/in laps).
 */

function scIsValidGps(lat, lng) {
    if (lat == null || lng == null) return false;
    const la = Number(lat);
    const ln = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
    if (Math.abs(la) > 90 || Math.abs(ln) > 180) return false;
    if (la === 0 && ln === 0) return false;
    if (ln === 0 && la !== 0) return false;
    if (la === 0 && ln !== 0) return false;
    return true;
}

function scGetGpsKeepIndexSet(records) {
    if (!records || records.length < 10) return null;
    const good = [];
    for (let i = 0; i < records.length; i++) {
        const r = records[i];
        if (!r.location) continue;
        const lat = r.location.latitude;
        const lng = r.location.longitude;
        if (!scIsValidGps(lat, lng)) continue;
        good.push({ i, lat, lng });
    }
    if (good.length < 10) return null;
    const CELL = 0.05;
    const MARGIN = 2;
    const cellCount = new Map();
    for (const g of good) {
        const bi = Math.floor(g.lat / CELL);
        const bj = Math.floor(g.lng / CELL);
        const k = `${bi},${bj}`;
        cellCount.set(k, (cellCount.get(k) || 0) + 1);
    }
    const sortedCells = [...cellCount.entries()].sort((a, b) => b[1] - a[1]);
    const best = sortedCells[0];
    const second = sortedCells[1];
    const bestN = best[1];
    if (bestN < good.length * 0.55) return null;
    if (second && bestN < second[1] * 1.35) return null;
    const [bi, bj] = best[0].split(',').map(Number);
    const kept = new Set();
    for (const g of good) {
        const i = Math.floor(g.lat / CELL);
        const j = Math.floor(g.lng / CELL);
        if (Math.abs(i - bi) <= MARGIN && Math.abs(j - bj) <= MARGIN) {
            kept.add(g.i);
        }
    }
    if (kept.size < 5) return null;
    return kept;
}

/** Out lap = 0, in lap = -1 per API model; keep racing laps only */
function filterRacingLapsOnly(records) {
    return (records || []).filter((r) => typeof r.lap_number === 'number' && r.lap_number >= 1);
}

function getBestLapNumber(laps) {
    if (!laps || laps.length === 0) return null;
    let bestNum = null;
    let bestTime = Infinity;
    for (const lap of laps) {
        if (lap.lap_time != null && lap.lap_time > 0 && lap.lap_time < bestTime) {
            bestTime = lap.lap_time;
            bestNum = lap.lap_number;
        }
    }
    if (bestNum !== null) return bestNum;
    return laps[0].lap_number;
}

/**
 * Linear interpolation of value along cumulative distance.
 */
function resampleByNormalizedDistance(records, valueFn, nSamples) {
    if (!records || records.length === 0) return [];
    const n = Math.max(2, nSamples);
    const d0 = records[0].distance ?? 0;
    const d1 = records[records.length - 1].distance ?? d0;
    const span = Math.max(d1 - d0, 1e-9);
    const out = [];
    for (let k = 0; k < n; k++) {
        const t = k / (n - 1);
        const targetD = d0 + t * span;
        let i = 0;
        while (i < records.length - 1 && (records[i + 1].distance ?? 0) < targetD) {
            i++;
        }
        const a = records[i];
        const b = records[Math.min(i + 1, records.length - 1)];
        const da = a.distance ?? 0;
        const db = b.distance ?? 0;
        const seg = Math.max(db - da, 1e-12);
        const u = Math.min(1, Math.max(0, (targetD - da) / seg));
        const va = valueFn(a);
        const vb = valueFn(b);
        const v =
            va != null && vb != null
                ? va + u * (vb - va)
                : va != null
                  ? va
                  : vb;
        out.push(v != null && Number.isFinite(v) ? v : null);
    }
    return out;
}

class SessionComparisonScreen {
    constructor(apiClient) {
        this.apiClient = apiClient;
        this.map = null;
        this.polyA = null;
        this.polyB = null;
        this.speedChart = null;
        this.gChart = null;
        this._listenersBound = false;
    }

    init() {
        this.populateSessionSelects();
        if (!this._listenersBound) {
            const btn = document.getElementById('compare-run-btn');
            if (btn) {
                btn.addEventListener('click', () => this.runComparison());
            }
            this._listenersBound = true;
        }
        setTimeout(() => {
            if (this.map) this.map.invalidateSize();
        }, 150);
    }

    async populateSessionSelects() {
        const sa = document.getElementById('compare-session-a');
        const sb = document.getElementById('compare-session-b');
        if (!sa || !sb) return;
        try {
            const sessions = await this.apiClient.getSessions();
            const list = Array.isArray(sessions) ? sessions : [];
            const opts = '<option value="">Select session…</option>';
            const body = list
                .map(
                    (s) =>
                        `<option value="${this._escapeAttr(s.session_id)}">${this._escapeHtml(
                            s.session_id
                        )} (${(s.total_records ?? 0).toLocaleString()} rec)</option>`
                )
                .join('');
            sa.innerHTML = opts + body;
            sb.innerHTML = opts + body;
        } catch (e) {
            console.error(e);
            sa.innerHTML = '<option value="">Failed to load</option>';
            sb.innerHTML = '<option value="">Failed to load</option>';
        }
    }

    _escapeHtml(s) {
        if (s == null) return '';
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    _escapeAttr(s) {
        return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    async runComparison() {
        const sidA = document.getElementById('compare-session-a')?.value;
        const sidB = document.getElementById('compare-session-b')?.value;
        const mode = document.querySelector('input[name="compare-mode"]:checked')?.value || 'best_lap';
        const statusEl = document.getElementById('compare-status');
        const errEl = document.getElementById('compare-error');
        const metaEl = document.getElementById('compare-meta');

        const setStatus = (msg) => {
            if (statusEl) statusEl.textContent = msg;
        };
        const setErr = (msg) => {
            if (errEl) {
                errEl.textContent = msg || '';
                errEl.style.display = msg ? 'block' : 'none';
            }
        };

        setErr('');
        if (!sidA || !sidB) {
            setErr('Select both Session A and Session B.');
            return;
        }
        if (sidA === sidB) {
            setErr('Choose two different sessions for comparison.');
            return;
        }

        setStatus('Loading telemetry…');
        const btn = document.getElementById('compare-run-btn');
        if (btn) btn.disabled = true;

        try {
            let dataA;
            let dataB;
            let labelA = sidA;
            let labelB = sidB;

            if (mode === 'best_lap') {
                const lapsA = await this.apiClient.getSessionLaps(sidA);
                const lapsB = await this.apiClient.getSessionLaps(sidB);
                const lapA = getBestLapNumber(lapsA);
                const lapB = getBestLapNumber(lapsB);
                if (lapA == null || lapB == null) {
                    throw new Error('Could not determine best lap for one or both sessions.');
                }
                dataA = await this.apiClient.getTelemetryData(sidA, lapA, 200000);
                dataB = await this.apiClient.getTelemetryData(sidB, lapB, 200000);
                const la = lapsA.find((l) => l.lap_number === lapA);
                const lb = lapsB.find((l) => l.lap_number === lapB);
                const ta = la && la.lap_time != null ? ` (${la.lap_time.toFixed(2)}s)` : '';
                const tb = lb && lb.lap_time != null ? ` (${lb.lap_time.toFixed(2)}s)` : '';
                labelA = `${sidA} — lap ${lapA}${ta}`;
                labelB = `${sidB} — lap ${lapB}${tb}`;
            } else {
                dataA = await this.apiClient.getTelemetryData(sidA, null, 500000);
                dataB = await this.apiClient.getTelemetryData(sidB, null, 500000);
                dataA = filterRacingLapsOnly(dataA);
                dataB = filterRacingLapsOnly(dataB);
                if (dataA.length === 0 || dataB.length === 0) {
                    throw new Error(
                        'No racing laps (lap ≥ 1) after removing out/in laps. Check data or use best lap mode.'
                    );
                }
                labelA = `${sidA} — full session (racing laps)`;
                labelB = `${sidB} — full session (racing laps)`;
            }

            dataA = DistanceCalculator.calculateCumulativeDistance(dataA);
            dataB = DistanceCalculator.calculateCumulativeDistance(dataB);

            if (dataA.length < 2 || dataB.length < 2) {
                throw new Error('Not enough data points in one or both sessions.');
            }

            if (metaEl) {
                metaEl.innerHTML = `<div class="compare-meta-row"><span class="compare-meta-a">${this._escapeHtml(
                    labelA
                )}</span><span class="compare-meta-b">${this._escapeHtml(labelB)}</span></div>`;
            }

            const N = 400;
            const labels = Array.from({ length: N }, (_, k) =>
                `${((100 * k) / (N - 1)).toFixed(0)}%`
            );

            const speedA = resampleByNormalizedDistance(
                dataA,
                (r) => r.vehicle_dynamics?.speed ?? null,
                N
            );
            const speedB = resampleByNormalizedDistance(
                dataB,
                (r) => r.vehicle_dynamics?.speed ?? null,
                N
            );
            const latA = resampleByNormalizedDistance(
                dataA,
                (r) => r.vehicle_dynamics?.lateral_g ?? null,
                N
            );
            const latB = resampleByNormalizedDistance(
                dataB,
                (r) => r.vehicle_dynamics?.lateral_g ?? null,
                N
            );

            this._renderCharts(labels, speedA, speedB, latA, latB, labelA, labelB);
            this._renderMap(dataA, dataB, labelA, labelB);
            setStatus('Ready');
        } catch (e) {
            console.error(e);
            setErr(e.message || 'Comparison failed');
            setStatus('');
            if (this.speedChart) {
                this.speedChart.destroy();
                this.speedChart = null;
            }
            if (this.gChart) {
                this.gChart.destroy();
                this.gChart = null;
            }
            const wrap = document.getElementById('compare-charts-wrap');
            if (wrap) wrap.style.display = 'none';
            const meta = document.getElementById('compare-meta');
            if (meta) meta.innerHTML = '';
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    _renderCharts(labels, speedA, speedB, latA, latB, labelA, labelB) {
        const speedCanvas = document.getElementById('compare-chart-speed');
        const gCanvas = document.getElementById('compare-chart-g');
        if (!speedCanvas || !gCanvas) return;

        if (this.speedChart) {
            this.speedChart.destroy();
            this.speedChart = null;
        }
        if (this.gChart) {
            this.gChart.destroy();
            this.gChart = null;
        }

        const baseOpts = {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: '#c8c8c8' } },
                tooltip: {
                    callbacks: {
                        title: (items) => (items[0] ? `Distance ${items[0].label}` : ''),
                    },
                },
            },
            scales: {
                x: {
                    ticks: { color: '#909090', maxTicksLimit: 12 },
                    grid: { color: 'rgba(255,255,255,0.06)' },
                },
                y: {
                    ticks: { color: '#909090' },
                    grid: { color: 'rgba(255,255,255,0.06)' },
                },
            },
        };

        this.speedChart = new Chart(speedCanvas, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: `A — ${labelA}`,
                        data: speedA,
                        borderColor: '#4a90e2',
                        backgroundColor: 'rgba(74, 144, 226, 0.1)',
                        borderWidth: 2,
                        pointRadius: 0,
                        tension: 0.12,
                        spanGaps: true,
                    },
                    {
                        label: `B — ${labelB}`,
                        data: speedB,
                        borderColor: '#e89030',
                        backgroundColor: 'rgba(232, 144, 48, 0.1)',
                        borderWidth: 2,
                        pointRadius: 0,
                        tension: 0.12,
                        spanGaps: true,
                    },
                ],
            },
            options: {
                ...baseOpts,
                plugins: {
                    ...baseOpts.plugins,
                    title: {
                        display: true,
                        text: 'Speed (km/h)',
                        color: '#b0b0b0',
                        font: { size: 14 },
                    },
                },
            },
        });

        this.gChart = new Chart(gCanvas, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: `A — lateral G`,
                        data: latA,
                        borderColor: '#4a90e2',
                        borderWidth: 2,
                        pointRadius: 0,
                        tension: 0.12,
                        spanGaps: true,
                    },
                    {
                        label: `B — lateral G`,
                        data: latB,
                        borderColor: '#e89030',
                        borderWidth: 2,
                        pointRadius: 0,
                        tension: 0.12,
                        spanGaps: true,
                    },
                ],
            },
            options: {
                ...baseOpts,
                plugins: {
                    ...baseOpts.plugins,
                    title: {
                        display: true,
                        text: 'Lateral G',
                        color: '#b0b0b0',
                        font: { size: 14 },
                    },
                },
            },
        });

        const wrap = document.getElementById('compare-charts-wrap');
        if (wrap) wrap.style.display = 'grid';
    }

    _renderMap(dataA, dataB, labelA, labelB) {
        const el = document.getElementById('compare-map');
        if (!el) return;

        const coordsA = this._mapCoords(dataA);
        const coordsB = this._mapCoords(dataB);
        if (coordsA.length < 2 && coordsB.length < 2) {
            if (this.map) {
                this.map.remove();
                this.map = null;
            }
            el.innerHTML = '<p class="compare-map-empty">No GPS track to display.</p>';
            return;
        }

        el.innerHTML = '';
        if (this.map) {
            this.map.remove();
            this.map = null;
        }

        this.map = L.map(el).setView([-35.28, 149.13], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
        }).addTo(this.map);

        const group = L.featureGroup();
        if (coordsA.length >= 2) {
            this.polyA = L.polyline(coordsA, { color: '#4a90e2', weight: 3, opacity: 0.85 }).addTo(
                group
            );
        }
        if (coordsB.length >= 2) {
            this.polyB = L.polyline(coordsB, { color: '#e89030', weight: 3, opacity: 0.85 }).addTo(
                group
            );
        }
        group.addTo(this.map);
        if (coordsA.length >= 2 || coordsB.length >= 2) {
            this.map.fitBounds(group.getBounds(), { padding: [24, 24] });
        }

        const leg = document.getElementById('compare-map-legend');
        if (leg) {
            leg.innerHTML = `<span class="compare-leg-a">● A</span> ${this._escapeHtml(
                labelA
            )}<br><span class="compare-leg-b">● B</span> ${this._escapeHtml(labelB)}`;
        }
    }

    _mapCoords(records) {
        const keep = scGetGpsKeepIndexSet(records);
        const gpsOk = (record, idx) => {
            if (!record.location) return false;
            const lat = record.location.latitude;
            const lng = record.location.longitude;
            if (!scIsValidGps(lat, lng)) return false;
            if (keep && !keep.has(idx)) return false;
            return true;
        };
        return records
            .map((r, idx) => ({ r, idx }))
            .filter(({ r, idx }) => gpsOk(r, idx))
            .map(({ r }) => [r.location.latitude, r.location.longitude]);
    }
}
