/**
 * Full kbatch in qbpm iframe — ?qbpm=1 embed boot, tab switch, live ingest bridge
 */
(function (global) {
    'use strict';

    var params = new URLSearchParams(global.location.search);
    if (params.get('qbpm') !== '1' && params.get('qbpm') !== 'true') return;

    var KBATCH_TABS = [
        'analyzer', 'layouts', 'dictionary', 'quantum', 'training',
        'capsules', 'contrails', 'musica', 'symbollab', 'lattice'
    ];

    function notifyParent(msg) {
        try {
            if (global.parent && global.parent !== global) {
                global.parent.postMessage(Object.assign({ source: 'kbatch-qbpm' }, msg), '*');
            }
        } catch (_) { /* ignore */ }
    }

    function switchTab(tab) {
        if (KBATCH_TABS.indexOf(tab) < 0) return false;
        var btn = global.document.querySelector('.tab-btn[data-tab="' + tab + '"]');
        if (btn) {
            btn.click();
            return true;
        }
        return false;
    }

    function focusTypingInput() {
        var el = global.document.getElementById('typing-input')
            || global.document.getElementById('ct-input')
            || global.document.getElementById('term-input');
        if (el) {
            el.focus();
            return true;
        }
        switchTab('analyzer');
        global.setTimeout(function () {
            global.document.getElementById('typing-input')?.focus();
        }, 80);
        return false;
    }

    function setContrailsMode(mode) {
        switchTab('contrails');
        global.setTimeout(function () {
            var modeEl = global.document.getElementById('ct-mode');
            if (modeEl && mode) {
                modeEl.value = mode;
                modeEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (global.Contrails && typeof global.Contrails.start === 'function') {
                global.Contrails.start();
            }
        }, 100);
    }

    function boot() {
        global.document.documentElement.classList.add('qbpm-embed-full');
        global.document.body.classList.add('qbpm-embed-full');

        var link = global.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'lib/kbatch-qbpm-full.css';
        global.document.head.appendChild(link);

        notifyParent({ type: 'ready', ok: true, tool: 'kbatch', tabs: KBATCH_TABS });
    }

    global.addEventListener('message', function (ev) {
        var data = ev.data || {};
        if (data.type === 'qbpm-prompt-search' && data.query) {
            switchTab('analyzer');
            var input = global.document.getElementById('typing-input');
            if (input) {
                input.value = String(data.query);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.focus();
            } else if (global.kbatch && global.kbatch.processText) {
                global.kbatch.processText(String(data.query));
            }
        }
        if (data.type === 'qbpm-focus-input') focusTypingInput();
        if (data.type === 'qbpm-switch-tab' && data.tab) switchTab(data.tab);
        if (data.type === 'qbpm-pattern-mode' && data.mode) setContrailsMode(data.mode);
    });

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})(window);