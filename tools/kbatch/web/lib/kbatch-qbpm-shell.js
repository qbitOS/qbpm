/**
 * qbpm embed shell — postMessage bridge, ready signal, prompt search.
 */
(function (global) {
    'use strict';

    function notifyParent(msg) {
        try {
            if (global.parent && global.parent !== global) {
                global.parent.postMessage(Object.assign({ source: 'kbatch-qbpm' }, msg), '*');
            }
        } catch (_) { /* ignore */ }
    }

    global.addEventListener('message', function (ev) {
        var data = ev.data || {};
        if (data.type === 'qbpm-prompt-search' && data.query) {
            var input = global.document.getElementById('typing-input');
            if (input) {
                input.value = String(data.query);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.focus();
            } else if (global.kbatch && global.kbatch.processText) {
                global.kbatch.processText(String(data.query));
            }
        }
        if (data.type === 'qbpm-focus-input') {
            global.document.getElementById('typing-input')?.focus();
        }
    });

    function onReady() {
        notifyParent({ type: 'ready', ok: true });
        var ro = typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(function () { notifyParent({ type: 'resize' }); })
            : null;
        if (ro) ro.observe(global.document.body);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', function () {
            global.setTimeout(onReady, 120);
        });
    } else {
        global.setTimeout(onReady, 120);
    }
})(window);