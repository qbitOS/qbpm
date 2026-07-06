/**
 * kbatch-live-patch — installs fast pipeline + contrails after kbatch-main.js boots.
 */
(function (global) {
    'use strict';

    function install() {
        if (!global.kbatch || !global.KbatchLivePipeline) return;

        var origProcess = global.kbatch.processText;
        var origContrails = global.Contrails;

        if (global.KbatchContrailsFast && global.KbatchContrailsFast.create) {
            var fast = global.KbatchContrailsFast.create();
            if (fast && fast.feedKey) {
                global.Contrails = Object.assign({}, origContrails || {}, fast, {
                    searchByGesture: origContrails && origContrails.searchByGesture,
                    gestureToSymbol: origContrails && origContrails.gestureToSymbol,
                    VR_KEYBOARD: origContrails && origContrails.VR_KEYBOARD,
                    UniversalStroke: origContrails && origContrails.UniversalStroke
                });
            }
        }

        global.KbatchLivePipeline.install({
            onFlush: function (batch) {
                origProcess(batch);
                if (global.Contrails && typeof global.Contrails.feedText === 'function') {
                    global.Contrails.feedText(batch);
                }
            },
            onPublish: function (text) {
                if (typeof publishToEcosystem === 'function' && typeof buildPrefixBlocks === 'function') {
                    var Enc = global.Encoder;
                    var rhythm = Enc && Enc.toRhythm ? Enc.toRhythm(text) : null;
                    var flow = Enc && Enc.toKeyboardFlow ? Enc.toKeyboardFlow(text) : null;
                    var payload = {
                        text: text,
                        flow: flow && flow.arrows ? flow.arrows : '',
                        musica: Enc && Enc.toMusicNotation ? Enc.toMusicNotation(text) : '',
                        bpm: rhythm && rhythm.bpm ? rhythm.bpm : 0,
                        blocks: buildPrefixBlocks(text, 'text'),
                        stack: typeof buildStackEnvelope === 'function'
                            ? buildStackEnvelope(text, 'text', 'kbatch-live-pipeline')
                            : null,
                        live: true
                    };
                    publishToEcosystem('kbatch-keyboard-data', payload, ['iron-line', 'uterm-notes', 'kbatch-training']);
                    if (global.KbatchQbpmBridge && global.KbatchQbpmBridge.ingest) {
                        global.KbatchQbpmBridge.ingest(payload);
                    }
                }
            }
        });

        global.kbatch.processText = function (text) {
            global.KbatchLivePipeline.enqueueText(String(text || ''), { publish: true });
        };

        global.kbatch.processTextImmediate = origProcess;
        global.kbatch.flushLive = function () { global.KbatchLivePipeline.flushNow(); };
        global.kbatch.liveMetrics = function () { return global.KbatchLivePipeline.metrics(); };

        var benchEl = document.getElementById('s-bench');
        if (benchEl) {
            setInterval(function () {
                var m = global.KbatchLivePipeline.metrics();
                benchEl.textContent = m.lastFlushMs.toFixed(1) + 'ms · ' + m.charsPerSec + ' c/s';
            }, 500);
        }

        var streamEl = document.getElementById('s-stream');
        if (streamEl) streamEl.textContent = 'live-fast';
    }

    function boot() {
        install();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            global.setTimeout(boot, 0);
        });
    } else {
        global.setTimeout(boot, 0);
    }
})(window);