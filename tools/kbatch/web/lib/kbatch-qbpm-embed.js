/**
 * qbpm kbatch embed — collapsible sections · DDR pattern lanes · mode persistence
 */
(function (global) {
    'use strict';

    var STORAGE_KEY = 'kbatch-qbpm-sections';
    var MODE_KEY = 'kbatch-qbpm-pattern-mode';
    var DDR_ARROWS = ['\u2191', '\u2193', '\u2190', '\u2192', '\u2197', '\u2198', '\u2196', '\u2199'];

    function loadSections() {
        try {
            return JSON.parse(global.localStorage.getItem(STORAGE_KEY) || '{}');
        } catch (_) {
            return {};
        }
    }

    function saveSections(state) {
        try {
            global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (_) { /* ignore */ }
    }

    function bindCollapses() {
        var state = loadSections();
        global.document.querySelectorAll('.kbatch-collapse').forEach(function (section) {
            var id = section.dataset.section || section.id;
            var open = state[id] !== false;
            section.classList.toggle('open', open);
            var head = section.querySelector('.kbatch-collapse-head');
            if (!head) return;
            head.addEventListener('click', function () {
                section.classList.toggle('open');
                state[id] = section.classList.contains('open');
                saveSections(state);
            });
        });
    }

    function initPatternMode() {
        var modeEl = global.document.getElementById('kbatch-ct-mode');
        if (!modeEl) return;
        var params = new URLSearchParams(global.location.search);
        var saved = params.get('mode') || global.localStorage.getItem(MODE_KEY) || 'dance';
        if (modeEl.querySelector('option[value="' + saved + '"]')) {
            modeEl.value = saved;
        }
        modeEl.addEventListener('change', function () {
            global.localStorage.setItem(MODE_KEY, modeEl.value);
            try {
                global.parent.postMessage({
                    source: 'kbatch-qbpm',
                    type: 'pattern-mode',
                    mode: modeEl.value
                }, '*');
            } catch (_) { /* ignore */ }
        });
        global.addEventListener('kbatch-pattern-mode', function (ev) {
            var lane = global.document.getElementById('kbatch-ddr-lanes');
            if (lane && ev.detail) {
                lane.dataset.mode = ev.detail.mode || '';
            }
        });
    }

    function renderDdrLanes() {
        var lane = global.document.getElementById('kbatch-ddr-lanes');
        if (!lane) return;
        lane.innerHTML = DDR_ARROWS.map(function (arrow) {
            return '<span class="ddr-arrow" data-arrow="' + arrow + '">' + arrow + '</span>';
        }).join('');
    }

    function highlightDdrFlow() {
        var lane = global.document.getElementById('kbatch-ddr-lanes');
        var flowEl = global.document.getElementById('kbatch-ddr-flow');
        if (!lane) return;
        var flow = (flowEl && flowEl.textContent) || '';
        var recent = flow.slice(-8).split('');
        lane.querySelectorAll('.ddr-arrow').forEach(function (el) {
            var ch = el.dataset.arrow;
            el.classList.toggle('hit', recent.indexOf(ch) >= 0);
            el.classList.toggle('active', recent[recent.length - 1] === ch);
        });
    }

    function boot() {
        bindCollapses();
        initPatternMode();
        renderDdrLanes();
        global.setInterval(function () {
            if (global.Contrails && typeof global.Contrails.getBiometrics === 'function') {
                var bio = global.Contrails.getBiometrics();
                var flowEl = global.document.getElementById('kbatch-ddr-flow');
                if (flowEl && bio.flowPath && bio.flowPath.length) {
                    flowEl.textContent = bio.flowPath.slice(-32).join('');
                }
            }
            highlightDdrFlow();
        }, 180);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})(window);