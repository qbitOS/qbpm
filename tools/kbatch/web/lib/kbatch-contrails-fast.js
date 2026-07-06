/**
 * kbatch-contrails-fast — high-throughput Contrails / Pattern Flow engine
 * Optimized for live broadcast caption rates (300+ WPM, burst ingest).
 */
(function (global) {
    'use strict';

    var MAX_TRAILS = 2048;
    var MAX_FLOW = 4096;
    var ERGO_THROTTLE_MS = 200;
    var METRICS_THROTTLE_MS = 120;

    function ContrailsFast() {
        var canvas = document.getElementById('ct-canvas') || document.getElementById('cv-contrails');
        var ctx = canvas ? canvas.getContext('2d', { alpha: false }) : null;
        var input = document.getElementById('ct-input') || document.getElementById('typing-input');
        var statsEl = document.getElementById('ct-stats') || document.getElementById('kbatch-ct-stats');
        var legendEl = document.getElementById('ct-legend') || document.getElementById('kbatch-ct-legend');
        var metricsEl = document.getElementById('ct-metrics');
        var modeEl = document.getElementById('ct-mode') || document.getElementById('kbatch-ct-mode');
        var speedEl = document.getElementById('ct-speed') || document.getElementById('kbatch-ct-speed');
        var ergoPanel = document.getElementById('ct-ergo-panel');
        var ergoGrid = document.getElementById('ct-ergo-grid');
        var fingerGrid = document.getElementById('ct-finger-grid');
        var healthRisks = document.getElementById('ct-health-risks');
        var flowSymbols = document.getElementById('ct-flow-symbols') || document.getElementById('kbatch-ddr-flow');

        if (!canvas || !ctx) {
            return { active: false, feedText: function () {}, feedKey: function () {}, start: function () {}, stop: function () {} };
        }

        var embedMode = global.document.body && global.document.body.classList.contains('qbpm-embed');

        var KBD = {};
        'qwertyuiop'.split('').forEach(function (k, i) { KBD[k] = [0, i]; });
        'asdfghjkl;'.split('').forEach(function (k, i) { KBD[k] = [1, i]; });
        'zxcvbnm,./'.split('').forEach(function (k, i) { KBD[k] = [2, i]; });
        KBD[' '] = [3, 4.5];
        KBD['\t'] = [0, -1];
        KBD['\n'] = [1, 10];
        '1234567890'.split('').forEach(function (k, i) { KBD[k] = [-1, i]; });

        var FINGER_MAP = {};
        'qaz'.split('').forEach(function (k) { FINGER_MAP[k] = { finger: 'L-Pinky', hand: 'left', force: 0.6 }; });
        'wsx'.split('').forEach(function (k) { FINGER_MAP[k] = { finger: 'L-Ring', hand: 'left', force: 0.7 }; });
        'edc'.split('').forEach(function (k) { FINGER_MAP[k] = { finger: 'L-Middle', hand: 'left', force: 0.85 }; });
        'rfvtgb'.split('').forEach(function (k) { FINGER_MAP[k] = { finger: 'L-Index', hand: 'left', force: 1.0 }; });
        'yhnujm'.split('').forEach(function (k) { FINGER_MAP[k] = { finger: 'R-Index', hand: 'right', force: 1.0 }; });
        'ik,'.split('').forEach(function (k) { FINGER_MAP[k] = { finger: 'R-Middle', hand: 'right', force: 0.85 }; });
        'ol.'.split('').forEach(function (k) { FINGER_MAP[k] = { finger: 'R-Ring', hand: 'right', force: 0.7 }; });
        'p;/'.split('').forEach(function (k) { FINGER_MAP[k] = { finger: 'R-Pinky', hand: 'right', force: 0.6 }; });
        FINGER_MAP[' '] = { finger: 'Thumb', hand: 'both', force: 0.5 };

        var HOME_ROW = new Set('asdfghjkl;'.split(''));
        var KEY_SPACING_MM = 19.05;
        var COLS = 10;
        var ROWS = 4;

        var trails = new Array(MAX_TRAILS);
        var trailHead = 0;
        var trailCount = 0;
        var heatmap = new Float32Array(COLS * ROWS);
        var keyXY = Object.create(null);
        var layoutW = 0;
        var layoutH = 0;
        var lastKey = null;
        var lastPos = null;
        var totalKeys = 0;
        var totalDist = 0;
        var dirChanges = 0;
        var lastDir = '';
        var animFrame = 0;
        var active = false;
        var fingerData = Object.create(null);
        var flowPath = [];
        var totalDistMM = 0;
        var muscleExertion = 0;
        var homeRowHits = 0;
        var sessionStart = 0;
        var pendingKeys = [];
        var lastErgoAt = 0;
        var lastMetricsAt = 0;
        var lastInputLen = 0;

        function dist(a, b) {
            var dx = b.x - a.x;
            var dy = b.y - a.y;
            return Math.sqrt(dx * dx + dy * dy);
        }

        function direction(a, b) {
            var dx = b.x - a.x;
            var dy = b.y - a.y;
            var angle = Math.atan2(dy, dx) * 180 / Math.PI;
            if (angle > -22.5 && angle <= 22.5) return '\u2192';
            if (angle > 22.5 && angle <= 67.5) return '\u2198';
            if (angle > 67.5 && angle <= 112.5) return '\u2193';
            if (angle > 112.5 && angle <= 157.5) return '\u2199';
            if (angle > -67.5 && angle <= -22.5) return '\u2197';
            if (angle > -112.5 && angle <= -67.5) return '\u2191';
            if (angle > -157.5 && angle <= -112.5) return '\u2196';
            return '\u2190';
        }

        function trailColor(d) {
            if (d < 30) return { r: 88, g: 166, b: 255 };
            if (d < 60) return { r: 63, g: 185, b: 80 };
            if (d < 100) return { r: 212, g: 160, b: 23 };
            return { r: 168, g: 139, b: 250 };
        }

        function rebuildKeyCache(w, h) {
            layoutW = w;
            layoutH = h;
            var kw = w / (COLS + 2);
            var kh = (h - 40) / (ROWS + 1);
            var keys = Object.keys(KBD);
            for (var i = 0; i < keys.length; i++) {
                var k = keys[i];
                var pos = KBD[k];
                keyXY[k] = {
                    x: (pos[1] + 1.5) * kw,
                    y: (pos[0] + 1.5) * kh + 20
                };
            }
        }

        function resize() {
            var dpr = global.devicePixelRatio || 1;
            var rect = canvas.getBoundingClientRect();
            var w = rect.width;
            var h = rect.height;
            if (w < 1 || h < 1) return;
            canvas.width = Math.floor(w * dpr);
            canvas.height = Math.floor(h * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            rebuildKeyCache(w, h);
        }

        function pushTrail(t) {
            var idx = (trailHead + trailCount) % MAX_TRAILS;
            trails[idx] = t;
            if (trailCount < MAX_TRAILS) trailCount++;
            else trailHead = (trailHead + 1) % MAX_TRAILS;
        }

        function pushFlow(sym) {
            flowPath.push(sym);
            if (flowPath.length > MAX_FLOW) flowPath.splice(0, flowPath.length - MAX_FLOW);
        }

        function feedKey(key, correct) {
            var lk = String(key || '').toLowerCase();
            var pos = keyXY[lk];
            if (!pos) return;
            if (totalKeys === 0) sessionStart = Date.now();
            totalKeys++;

            var kp = KBD[lk];
            if (kp) {
                var row = Math.max(0, Math.min(ROWS - 1, kp[0] + 1));
                var col = Math.max(0, Math.min(COLS - 1, kp[1]));
                heatmap[row * COLS + col] += 1;
            }

            if (HOME_ROW.has(lk)) homeRowHits++;
            var finfo = FINGER_MAP[lk] || { finger: 'Unknown', hand: 'unknown', force: 0.5 };
            if (!fingerData[finfo.finger]) {
                fingerData[finfo.finger] = { keys: 0, dist: 0, hand: finfo.hand, force: finfo.force };
            }
            fingerData[finfo.finger].keys++;

            if (lastPos) {
                var d = dist(lastPos, pos);
                totalDist += d;
                var dmm = d * (KEY_SPACING_MM / 40);
                totalDistMM += dmm;
                muscleExertion += 0.02 + (dmm * 0.0001);
                fingerData[finfo.finger].dist += dmm;

                var dir = direction(lastPos, pos);
                if (lastDir && dir !== lastDir) dirChanges++;
                lastDir = dir;
                pushFlow(dir);
                pushTrail({
                    x1: lastPos.x, y1: lastPos.y, x2: pos.x, y2: pos.y,
                    color: trailColor(d), opacity: 1.0, age: 0,
                    correct: correct, dir: dir, finger: finfo.finger
                });
            } else {
                pushFlow('\u25CF');
            }
            lastPos = pos;
            lastKey = key;
        }

        function flushPending() {
            if (!pendingKeys.length) return;
            for (var i = 0; i < pendingKeys.length; i++) {
                var item = pendingKeys[i];
                feedKey(item.key, item.correct);
            }
            pendingKeys.length = 0;
            scheduleMetrics();
        }

        function scheduleMetrics() {
            var now = Date.now();
            if (now - lastMetricsAt < METRICS_THROTTLE_MS) return;
            lastMetricsAt = now;
            if (statsEl) {
                var eff = totalKeys > 1 ? Math.max(0, 100 - (totalDist / totalKeys) * 0.3).toFixed(0) : 0;
                var cpx = totalKeys > 1 ? ((dirChanges / Math.max(1, totalKeys - 1)) * 100).toFixed(0) : 0;
                statsEl.textContent = 'Keys: ' + totalKeys + ' | Eff: ' + eff + '% | Cpx: ' + cpx + '% | Trails: ' + trailCount + ' | ' + totalDistMM.toFixed(0) + 'mm';
            }
            if (metricsEl) {
                var eff2 = totalKeys > 1 ? Math.max(0, 100 - (totalDist / totalKeys) * 0.3) : 0;
                var cpx2 = totalKeys > 1 ? (dirChanges / Math.max(1, totalKeys - 1)) * 100 : 0;
                var homeRowPct = totalKeys > 0 ? (homeRowHits / totalKeys) * 100 : 0;
                var calories = (muscleExertion / 4184000 + totalDistMM * 0.0001);
                metricsEl.innerHTML = [
                    ['Total Keys', totalKeys, '#e6edf3'],
                    ['Efficiency', eff2.toFixed(1) + '%', eff2 > 70 ? '#3fb950' : eff2 > 40 ? '#d4a017' : '#f85149'],
                    ['Complexity', cpx2.toFixed(1) + '%', cpx2 > 50 ? '#f85149' : cpx2 > 25 ? '#d4a017' : '#3fb950'],
                    ['Travel', totalDistMM.toFixed(0) + 'mm', '#58a6ff'],
                    ['Home Row', homeRowPct.toFixed(0) + '%', homeRowPct > 60 ? '#3fb950' : '#d4a017'],
                    ['Energy', (muscleExertion * 1000).toFixed(2) + '\u00B5J', '#a78bfa'],
                    ['Calories', calories.toFixed(6), '#f472b6'],
                    ['Dir Changes', dirChanges, '#fb923c']
                ].map(function (row) {
                    return '<div style="padding:8px;background:#161b22;border:1px solid #21262d;border-radius:6px;">' +
                        '<div style="font-size:.5625rem;color:#484f58;">' + row[0] + '</div>' +
                        '<div style="font-size:.875rem;font-weight:700;color:' + row[2] + ';font-family:var(--mono);">' + row[1] + '</div></div>';
                }).join('');
            }
        }

        function iterTrails(fn) {
            for (var i = 0; i < trailCount; i++) {
                var idx = (trailHead + i) % MAX_TRAILS;
                var t = trails[idx];
                if (t) fn(t, i);
            }
        }

        function renderFlow(w, h) {
            ctx.fillStyle = '#0d1117';
            ctx.fillRect(0, 0, w, h);
            if (!trailCount) {
                ctx.fillStyle = '#484f58';
                ctx.font = '12px monospace';
                ctx.textAlign = 'center';
                ctx.fillText('Type to see pattern flow', w / 2, h / 2);
                ctx.textAlign = 'start';
                return;
            }
            var stepX = w / Math.max(trailCount, 1);
            ctx.lineWidth = 2;
            var prevY = h / 2;
            var i = 0;
            iterTrails(function (t) {
                if (i === 0) { i++; return; }
                var x1 = (i - 1) * stepX;
                var x2 = i * stepX;
                var y1 = prevY;
                var y2 = h / 2 + (t.y1 - t.y2) * 0.5;
                prevY = y2;
                var hue = t.correct ? 140 : 0;
                ctx.strokeStyle = 'hsla(' + hue + ',70%,55%,' + t.opacity + ')';
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                var cpx = (x1 + x2) / 2;
                ctx.bezierCurveTo(cpx, y1, cpx, y2, x2, y2);
                ctx.stroke();
                ctx.fillStyle = 'hsla(' + hue + ',70%,70%,' + t.opacity + ')';
                ctx.beginPath();
                ctx.arc(x2, y2, 3, 0, Math.PI * 2);
                ctx.fill();
                i++;
            });
        }

        function renderContrails(w, h) {
            ctx.fillStyle = '#0d1117';
            ctx.fillRect(0, 0, w, h);
            var kw = w / (COLS + 2);
            var kh = (h - 40) / (ROWS + 1);
            var keyRows = ['qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./'];
            ctx.strokeStyle = '#21262d';
            ctx.lineWidth = 0.5;
            keyRows.forEach(function (row, r) {
                row.split('').forEach(function (key, c) {
                    var x = (c + 1.5) * kw - kw / 2;
                    var y = (r + 1.5) * kh + 20 - kh / 2;
                    ctx.strokeRect(x, y, kw - 1, kh - 1);
                    ctx.fillStyle = '#30363d';
                    ctx.font = '9px monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText(key, x + kw / 2, y + kh / 2 + 3);
                });
            });
            ctx.textAlign = 'start';
            if (!trailCount) {
                ctx.fillStyle = '#484f58';
                ctx.font = '12px monospace';
                ctx.textAlign = 'center';
                ctx.fillText('Type to generate contrails', w / 2, h / 2);
                ctx.textAlign = 'start';
                return;
            }
            iterTrails(function (t) {
                if (t.opacity < 0.01) return;
                ctx.save();
                ctx.globalAlpha = t.opacity;
                ctx.strokeStyle = 'rgb(' + t.color.r + ',' + t.color.g + ',' + t.color.b + ')';
                ctx.shadowColor = ctx.strokeStyle;
                ctx.shadowBlur = 4;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(t.x1, t.y1);
                var cpx = (t.x1 + t.x2) / 2;
                var cpy = Math.min(t.y1, t.y2) - 15;
                ctx.quadraticCurveTo(cpx, cpy, t.x2, t.y2);
                ctx.stroke();
                ctx.fillStyle = 'rgba(' + t.color.r + ',' + t.color.g + ',' + t.color.b + ',' + t.opacity + ')';
                ctx.beginPath();
                ctx.arc(t.x2, t.y2, 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            });
        }

        function renderHeatmap(w, h) {
            ctx.fillStyle = '#0d1117';
            ctx.fillRect(0, 0, w, h);
            var maxHeat = 1;
            for (var i = 0; i < heatmap.length; i++) {
                if (heatmap[i] > maxHeat) maxHeat = heatmap[i];
            }
            var kw = w / (COLS + 2);
            var kh = (h - 40) / (ROWS + 1);
            var keys = ['1234567890'.split(''), 'qwertyuiop'.split(''), 'asdfghjkl;'.split(''), 'zxcvbnm,./'.split('')];
            keys.forEach(function (row, r) {
                row.forEach(function (key, c) {
                    var x = (c + 1.5) * kw - kw / 2;
                    var y = r * kh + 20;
                    var heat = heatmap[Math.max(0, r) * COLS + Math.min(c, COLS - 1)] / maxHeat;
                    var hue = 240 - heat * 240;
                    ctx.fillStyle = 'hsla(' + hue + ',80%,' + (20 + heat * 40) + '%,' + (0.3 + heat * 0.7) + ')';
                    ctx.fillRect(x + 1, y + 1, kw - 2, kh - 2);
                    ctx.fillStyle = heat > 0.5 ? '#fff' : '#8b949e';
                    ctx.font = Math.min(14, kw * 0.5) + 'px monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText(key, x + kw / 2, y + kh / 2 + 4);
                });
            });
            ctx.textAlign = 'start';
        }

        function renderRhythm(w, h) {
            ctx.fillStyle = '#0d1117';
            ctx.fillRect(0, 0, w, h);
            if (!trailCount) return;
            var noteH = h / 8;
            var noteW = Math.max(4, w / trailCount);
            var i = 0;
            iterTrails(function (t) {
                var x = i * noteW;
                var d = dist({ x: t.x1, y: t.y1 }, { x: t.x2, y: t.y2 });
                var pitch = Math.max(0, Math.min(7, Math.floor(d / 20)));
                var y = (7 - pitch) * noteH;
                var hue = (i / trailCount) * 360;
                ctx.fillStyle = 'hsla(' + hue + ',70%,55%,' + t.opacity + ')';
                ctx.beginPath();
                ctx.ellipse(x + noteW / 2, y + noteH / 2, noteW / 2 - 1, noteH / 3, 0, 0, Math.PI * 2);
                ctx.fill();
                i++;
            });
        }

        function renderDance(w, h) {
            ctx.fillStyle = '#0d1117';
            ctx.fillRect(0, 0, w, h);
            if (!trailCount) return;
            var cx = w / 2;
            var cy = h / 2;
            ctx.save();
            ctx.translate(cx, cy);
            var i = 0;
            iterTrails(function (t) {
                var angle = (i / trailCount) * Math.PI * 4;
                var radius = (i / trailCount) * Math.min(w, h) * 0.4;
                var x = Math.cos(angle) * radius;
                var y = Math.sin(angle) * radius;
                var hue = (i * 7) % 360;
                ctx.fillStyle = 'hsla(' + hue + ',80%,60%,' + t.opacity + ')';
                ctx.beginPath();
                ctx.arc(x, y, 3 + t.opacity * 8, 0, Math.PI * 2);
                ctx.fill();
                i++;
            });
            ctx.restore();
        }

        function renderErgo(w, h) {
            ctx.fillStyle = '#0d1117';
            ctx.fillRect(0, 0, w, h);
            if (!totalKeys) return;
            var kw = w / (COLS + 2);
            var kh = (h - 40) / (ROWS + 1);
            var keyRows = ['qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./'];
            keyRows.forEach(function (row, r) {
                row.split('').forEach(function (key, c) {
                    var x = (c + 1.5) * kw - kw / 2;
                    var y = (r + 1.5) * kh + 20 - kh / 2;
                    var fi = FINGER_MAP[key] || { force: 0.5 };
                    var fd = fingerData[fi.finger] || { keys: 0 };
                    var strain = Math.min(1, fd.keys / Math.max(totalKeys, 1) * 5);
                    var hue = (1 - strain) * 120;
                    ctx.fillStyle = 'hsla(' + hue + ',70%,' + (HOME_ROW.has(key) ? 35 : 25) + '%,' + (0.4 + strain * 0.6) + ')';
                    ctx.fillRect(x + 1, y + 1, kw - 2, kh - 2);
                });
            });
        }

        function renderFinger(w, h) {
            ctx.fillStyle = '#0d1117';
            ctx.fillRect(0, 0, w, h);
            var fingers = Object.keys(fingerData);
            if (!fingers.length) return;
            var ordered = ['L-Pinky', 'L-Ring', 'L-Middle', 'L-Index', 'Thumb', 'R-Index', 'R-Middle', 'R-Ring', 'R-Pinky'];
            var barW = Math.max(20, (w - 80) / ordered.length - 4);
            var maxKeys = 1;
            fingers.forEach(function (n) {
                if (fingerData[n].keys > maxKeys) maxKeys = fingerData[n].keys;
            });
            ordered.forEach(function (name, i) {
                var data = fingerData[name] || { keys: 0 };
                var x = 40 + i * (barW + 4);
                var pct = data.keys / maxKeys;
                var barH = pct * (h - 80);
                var y = h - 30 - barH;
                ctx.fillStyle = '#4ade80';
                ctx.fillRect(x, y, barW, barH);
                ctx.fillStyle = '#e6edf3';
                ctx.font = 'bold 9px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(String(data.keys), x + barW / 2, y - 4);
            });
            ctx.textAlign = 'start';
        }

        function updateErgoPanel() {
            var now = Date.now();
            if (now - lastErgoAt < ERGO_THROTTLE_MS) return;
            lastErgoAt = now;
            if (!ergoGrid || !totalKeys) return;
            var elapsed = (Date.now() - sessionStart) / 1000 || 1;
            var calories = muscleExertion / 4184000 + totalDistMM * 0.0001;
            var homeRowPct = totalKeys > 0 ? (homeRowHits / totalKeys) * 100 : 0;
            var rsiRisk = Math.max(0, Math.min(100, 100 - homeRowPct - (totalKeys < 50 ? 30 : 0)));
            var comfort = homeRowPct > 70 ? 90 : homeRowPct > 50 ? 70 : homeRowPct > 30 ? 50 : 30;
            var wpm = (totalKeys / 5) / (elapsed / 60);
            if (flowSymbols) flowSymbols.textContent = flowPath.slice(-60).join('');
            if (ergoGrid) {
                ergoGrid.innerHTML = [
                    ['Travel', totalDistMM.toFixed(0) + 'mm', '#58a6ff'],
                    ['WPM', wpm.toFixed(0), wpm > 60 ? '#3fb950' : '#d4a017'],
                    ['Comfort', comfort.toFixed(0) + '%', comfort > 70 ? '#3fb950' : '#d4a017'],
                    ['RSI Risk', rsiRisk.toFixed(0) + '%', rsiRisk < 30 ? '#3fb950' : '#f85149']
                ].map(function (row) {
                    return '<div style="padding:6px;background:#161b22;border:1px solid #21262d;border-radius:6px;">' +
                        '<div style="font-size:.5rem;color:#484f58;">' + row[0] + '</div>' +
                        '<div style="font-size:.75rem;font-weight:700;color:' + row[2] + ';font-family:var(--mono);">' + row[1] + '</div></div>';
                }).join('');
            }
            if (healthRisks) {
                var risks = rsiRisk > 60 ? [['RSI', '#f85149']] : [['All Clear', '#3fb950']];
                healthRisks.innerHTML = risks.map(function (r) {
                    return '<span style="padding:2px 8px;background:' + r[1] + '22;color:' + r[1] + ';border:1px solid ' + r[1] + '44;border-radius:4px;font-family:var(--mono);font-size:.5625rem;">' + r[0] + '</span>';
                }).join('');
            }
        }

        function animate() {
            if (!active) return;
            if (layoutW < 1) resize();
            flushPending();
            var w = layoutW;
            var h = layoutH;
            var mode = modeEl ? modeEl.value : 'contrails';
            var speed = speedEl ? parseInt(speedEl.value, 10) / 5 : 1;

            iterTrails(function (t) {
                t.opacity *= (0.998 - speed * 0.001);
                t.age++;
            });

            switch (mode) {
                case 'heatmap': renderHeatmap(w, h); break;
                case 'rhythm': renderRhythm(w, h); break;
                case 'dance': renderDance(w, h); break;
                case 'flow': renderFlow(w, h); break;
                case 'ergo': renderErgo(w, h); break;
                case 'finger': renderFinger(w, h); break;
                default: renderContrails(w, h);
            }

            var showErgo = mode === 'ergo' || mode === 'finger' || mode === 'flow';
            if (ergoPanel) ergoPanel.style.display = showErgo ? '' : 'none';
            if (showErgo) updateErgoPanel();

            animFrame = global.requestAnimationFrame(animate);
        }

        function start() {
            if (active) return;
            active = true;
            resize();
            if (legendEl) {
                legendEl.innerHTML = [
                    ['#58a6ff', 'Efficient'],
                    ['#3fb950', 'Smooth'],
                    ['#d4a017', 'Moderate'],
                    ['#a78bfa', 'Complex']
                ].map(function (pair) {
                    return '<span style="display:flex;align-items:center;gap:4px;font-size:.5625rem;color:#8b949e;">' +
                        '<span style="width:10px;height:10px;border-radius:50%;background:' + pair[0] + ';"></span>' + pair[1] + '</span>';
                }).join('');
            }
            animate();
        }

        function stop() {
            active = false;
            global.cancelAnimationFrame(animFrame);
        }

        function clear() {
            trailHead = 0;
            trailCount = 0;
            heatmap = new Float32Array(COLS * ROWS);
            lastKey = null;
            lastPos = null;
            totalKeys = 0;
            totalDist = 0;
            dirChanges = 0;
            lastDir = '';
            fingerData = Object.create(null);
            flowPath = [];
            totalDistMM = 0;
            muscleExertion = 0;
            homeRowHits = 0;
            sessionStart = 0;
            pendingKeys.length = 0;
            if (ctx && layoutW > 0) {
                ctx.fillStyle = '#0d1117';
                ctx.fillRect(0, 0, layoutW, layoutH);
            }
            if (statsEl) statsEl.textContent = 'Type or paste text to visualize';
            if (metricsEl) metricsEl.innerHTML = '';
            if (flowSymbols) flowSymbols.textContent = '';
        }

        function feedText(text) {
            if (!active) start();
            var s = String(text || '');
            for (var i = 0; i < s.length; i++) {
                pendingKeys.push({ key: s[i], correct: true });
            }
            flushPending();
        }

        function queueKey(key, correct) {
            pendingKeys.push({ key: key, correct: correct !== false });
        }

        function getBiometrics() {
            var elapsed = sessionStart > 0 ? (Date.now() - sessionStart) / 1000 : 0;
            var homeRowPct = totalKeys > 0 ? (homeRowHits / totalKeys) * 100 : 0;
            return {
                totalKeys: totalKeys,
                totalDistMM: Math.round(totalDistMM),
                muscleExertion: muscleExertion * 1000,
                calories: muscleExertion / 4184000 + totalDistMM * 0.0001,
                homeRowPct: Math.round(homeRowPct),
                rsiRisk: Math.max(0, Math.min(100, 100 - homeRowPct - (totalKeys < 50 ? 30 : 0))),
                wpm: elapsed > 0 ? Math.round((totalKeys / 5) / (elapsed / 60)) : 0,
                fingerData: Object.assign({}, fingerData),
                flowPath: flowPath.slice(),
                heatmap: heatmap,
                lastDirections: flowPath.slice(-20)
            };
        }

        if (input) {
            input.addEventListener('input', function () {
                if (!active) start();
                var text = input.value;
                if (text.length > lastInputLen) {
                    queueKey(text[text.length - 1], true);
                }
                lastInputLen = text.length;
            });
            input.addEventListener('focus', function () { if (!active) start(); });
        }

        var panel = document.getElementById('panel-contrails');
        if (panel) {
            var observer = new MutationObserver(function () {
                if (panel.classList.contains('active')) start();
                else stop();
            });
            observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
        } else if (embedMode) {
            global.setTimeout(function () { start(); }, 80);
        }

        if (modeEl) {
            modeEl.addEventListener('change', function () {
                if (!active) start();
                global.dispatchEvent(new CustomEvent('kbatch-pattern-mode', { detail: { mode: modeEl.value } }));
            });
        }

        global.addEventListener('resize', function () {
            if (active) resize();
        }, { passive: true });

        return {
            get active() { return active; },
            feedKey: function (k, c) { queueKey(k, c); flushPending(); },
            feedText: feedText,
            clear: clear,
            start: start,
            stop: stop,
            getBiometrics: getBiometrics,
            flowPath: flowPath,
            heatmap: heatmap
        };
    }

    global.KbatchContrailsFast = { create: ContrailsFast };
})(window);