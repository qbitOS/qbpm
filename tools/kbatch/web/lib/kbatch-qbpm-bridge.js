/**
 * kbatch → qbpm live ingest bridge (standalone :8795 or embedded ?qbpm=1).
 */
(function (global) {
    'use strict';

    function qbpmOrigin() {
        var params = new URLSearchParams(global.location.search);
        if (params.get('qbpmOrigin')) return params.get('qbpmOrigin');
        if (params.get('qbpm') === '1') return global.location.origin;
        var hinted = params.get('qbpm');
        if (hinted && /^https?:\/\//.test(hinted)) return hinted.replace(/\/$/, '');
        return 'http://127.0.0.1:8796';
    }

    function enabled() {
        var params = new URLSearchParams(global.location.search);
        if (params.get('qbpm') === '0') return false;
        return params.get('qbpm') !== 'off';
    }

    var queue = [];
    var flushing = false;

    async function postIngest(origin, payload) {
        var url = origin.replace(/\/$/, '') + '/api/live/ingest?source=kbatch';
        var res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            mode: 'cors',
            keepalive: true
        });
        if (!res.ok) throw new Error('qbpm ingest ' + res.status);
        return res.json();
    }

    async function flush(origin) {
        if (flushing || !queue.length) return;
        flushing = true;
        var batch = queue;
        queue = [];
        try {
            var latest = batch[batch.length - 1];
            await postIngest(origin, latest);
        } catch (err) {
            if (typeof console !== 'undefined' && console.debug) {
                console.debug('[kbatch-qbpm]', err.message || err);
            }
        } finally {
            flushing = false;
            if (queue.length) global.requestAnimationFrame(function () { flush(origin); });
        }
    }

    global.KbatchQbpmBridge = {
        origin: qbpmOrigin(),
        enabled: enabled(),
        ingest: function (payload) {
            if (!this.enabled || !payload) return;
            queue.push(payload);
            flush(this.origin);
        },
        ping: async function () {
            var url = this.origin.replace(/\/$/, '') + '/api/health';
            var res = await fetch(url, { mode: 'cors' });
            return res.json();
        }
    };
})(window);