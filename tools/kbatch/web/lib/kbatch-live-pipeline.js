/**
 * kbatch-live-pipeline — batched text ingest for live broadcast caption throughput.
 */
(function (global) {
    'use strict';

    var PUBLISH_INTERVAL_MS = 250;
    var textQueue = [];
    var publishBuffer = '';
    var publishTimer = 0;
    var rafId = 0;
    var onFlush = null;
    var onPublish = null;
    var metrics = {
        enqueued: 0,
        flushed: 0,
        charsPerSec: 0,
        lastFlushMs: 0,
        queueDepth: 0,
        flushCount: 0
    };
    var lastFlushAt = 0;
    var charsSinceFlush = 0;

    function scheduleFlush() {
        if (rafId) return;
        rafId = global.requestAnimationFrame(flushFrame);
    }

    function schedulePublish(text) {
        publishBuffer += text;
        if (publishTimer) return;
        publishTimer = global.setTimeout(function () {
            publishTimer = 0;
            var chunk = publishBuffer;
            publishBuffer = '';
            if (onPublish && chunk) onPublish(chunk);
        }, PUBLISH_INTERVAL_MS);
    }

    function flushFrame() {
        rafId = 0;
        if (!textQueue.length) return;

        var started = performance.now();
        var batch = textQueue.join('');
        textQueue.length = 0;
        metrics.queueDepth = 0;
        metrics.enqueued += batch.length;
        charsSinceFlush += batch.length;

        if (onFlush && batch) {
            onFlush(batch);
            metrics.flushed += batch.length;
            metrics.flushCount++;
        }

        metrics.lastFlushMs = performance.now() - started;
        var now = performance.now();
        if (lastFlushAt > 0) {
            var dt = (now - lastFlushAt) / 1000;
            if (dt > 0) metrics.charsPerSec = Math.round(charsSinceFlush / dt);
        }
        lastFlushAt = now;
        charsSinceFlush = 0;

        if (textQueue.length) scheduleFlush();
    }

    function enqueueText(text, opts) {
        var s = String(text || '');
        if (!s.length) return;
        textQueue.push(s);
        metrics.queueDepth = textQueue.join('').length;
        scheduleFlush();
        if (!opts || opts.publish !== false) schedulePublish(s);
    }

    global.KbatchLivePipeline = {
        enqueueText: enqueueText,
        flushNow: function () {
            if (rafId) {
                global.cancelAnimationFrame(rafId);
                rafId = 0;
            }
            flushFrame();
        },
        install: function (config) {
            onFlush = config.onFlush || null;
            onPublish = config.onPublish || null;
        },
        metrics: function () {
            metrics.queueDepth = textQueue.join('').length;
            return Object.assign({}, metrics);
        }
    };
})(window);