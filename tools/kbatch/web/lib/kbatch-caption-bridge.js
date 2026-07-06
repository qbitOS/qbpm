/**
 * kbatch-caption-bridge — blank-style live caption / teleprompter ingest for kbatch.
 * Listens on ecosystem buses and feeds word-burst text into the fast pipeline.
 */
(function (global) {
    'use strict';

    var MAX_TRANSCRIPT_ROWS = 120;
    var MIN_WORD_INTERVAL_MS = 32;
    var teleEl = null;
    var transcriptEl = null;
    var lastTele = '';
    var lastWordAt = 0;
    var rollingText = '';
    var speechRec = null;
    var speechOn = false;

    function $(id) { return document.getElementById(id); }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function setTeleprompter(line) {
        if (!teleEl) teleEl = $('kb-sf-tele');
        if (!teleEl) return;
        var text = String(line || '').trim();
        if (!text || text === lastTele) return;
        lastTele = text;
        teleEl.textContent = text;
    }

    function pushTranscriptRow(html) {
        if (!transcriptEl) transcriptEl = $('kb-sf-transcript');
        if (!transcriptEl) return;
        var logOn = $('kb-sf-log');
        if (logOn && !logOn.checked) return;
        var row = document.createElement('div');
        row.innerHTML = html;
        transcriptEl.insertBefore(row, transcriptEl.firstChild);
        while (transcriptEl.children.length > MAX_TRANSCRIPT_ROWS) {
            transcriptEl.removeChild(transcriptEl.lastChild);
        }
    }

    function ingestCaptionText(text, meta) {
        var clean = String(text || '').replace(/\s+/g, ' ').trim();
        if (!clean) return;

        setTeleprompter(clean);

        var ts = new Date().toISOString().slice(11, 19);
        var src = meta && meta.source ? meta.source : 'live';
        pushTranscriptRow(
            '<span style="color:#484f58;">' + ts + '</span> ' +
            '<span style="color:#58a6ff;">[' + escapeHtml(src) + ']</span> ' +
            escapeHtml(clean)
        );

        var now = Date.now();
        if (now - lastWordAt < MIN_WORD_INTERVAL_MS) {
            rollingText += (rollingText ? ' ' : '') + clean;
        } else {
            rollingText = clean;
        }
        lastWordAt = now;

        if (global.kbatch && typeof global.kbatch.processText === 'function') {
            global.kbatch.processText(clean + ' ');
        } else if (global.KbatchLivePipeline) {
            global.KbatchLivePipeline.enqueueText(clean + ' ', { publish: true });
        }
    }

    function extractCaptionFromMessage(msg) {
        if (!msg) return null;
        if (typeof msg === 'string') return { text: msg, source: 'raw' };

        if (msg.type === 'caption' || msg.type === 'caption-line' || msg.type === 'transcript-line') {
            return { text: msg.text || msg.line || (msg.payload && msg.payload.text), source: msg.source || 'caption' };
        }
        if (msg.type === 'sportsfield-teleprompter' && msg.line) {
            return { text: msg.line, source: 'sportsfield' };
        }
        if (msg.type === 'transcript-dca' && msg.segments && msg.segments.length) {
            var last = msg.segments[msg.segments.length - 1];
            return { text: last.text || last.token, source: 'dca' };
        }
        if (msg.type === 'keyboard-data' && msg.text) {
            return { text: msg.text, source: 'keyboard' };
        }
        if (msg.type === 'kbatch-keyboard-data' && msg.payload && msg.payload.text) {
            return { text: msg.payload.text, source: 'kbatch' };
        }
        if (msg.payload) {
            if (msg.payload.text) return { text: msg.payload.text, source: msg.source || 'payload' };
            if (msg.payload.caption) return { text: msg.payload.caption, source: 'payload' };
            if (Array.isArray(msg.payload.lines) && msg.payload.lines.length) {
                var ln = msg.payload.lines[msg.payload.lines.length - 1];
                return { text: typeof ln === 'string' ? ln : (ln.text || ln.caption), source: 'lines' };
            }
        }
        if (msg.text) return { text: msg.text, source: msg.source || 'bus' };
        if (msg.caption) return { text: msg.caption, source: 'caption' };
        return null;
    }

    function handleBusMessage(ev) {
        var cap = extractCaptionFromMessage(ev.data);
        if (!cap || !cap.text) return;
        ingestCaptionText(cap.text, cap);
    }

    function wireChannels() {
        var channels = ['kbatch-transcript', 'feed-caption', 'blank-feed', 'live-captions'];
        global.__kbatchCaptionChannels = global.__kbatchCaptionChannels || [];
        channels.forEach(function (name) {
            if (name === 'hexcast-stream') return;
            try {
                var ch = new BroadcastChannel(name);
                ch.onmessage = handleBusMessage;
                global.__kbatchCaptionChannels.push(ch);
            } catch (_) {}
        });
    }

    function startSpeechRecognition() {
        var SR = global.SpeechRecognition || global.webkitSpeechRecognition;
        if (!SR || speechOn) return false;
        speechRec = new SR();
        speechRec.continuous = true;
        speechRec.interimResults = true;
        speechRec.lang = 'en-US';
        speechRec.onresult = function (ev) {
            var interim = '';
            var final = '';
            for (var i = ev.resultIndex; i < ev.results.length; i++) {
                var t = ev.results[i][0].transcript;
                if (ev.results[i].isFinal) final += t;
                else interim += t;
            }
            if (interim) setTeleprompter(interim);
            if (final) ingestCaptionText(final, { source: 'mic' });
        };
        speechRec.onerror = function () { speechOn = false; };
        speechRec.onend = function () {
            if (speechOn) {
                try { speechRec.start(); } catch (_) { speechOn = false; }
            }
        };
        try {
            speechRec.start();
            speechOn = true;
            return true;
        } catch (_) {
            return false;
        }
    }

    function stopSpeechRecognition() {
        speechOn = false;
        if (speechRec) {
            try { speechRec.stop(); } catch (_) {}
            speechRec = null;
        }
    }

    function wire() {
        teleEl = $('kb-sf-tele');
        transcriptEl = $('kb-sf-transcript');
        wireChannels();

        global.KbatchCaptionBridge = {
            ingest: ingestCaptionText,
            setTeleprompter: setTeleprompter,
            startMic: startSpeechRecognition,
            stopMic: stopSpeechRecognition,
            rollingText: function () { return rollingText; }
        };

        var micBtn = $('kb-sf-mic');
        if (micBtn) {
            micBtn.addEventListener('click', function () {
                if (speechOn) {
                    stopSpeechRecognition();
                    micBtn.textContent = 'Mic';
                } else if (startSpeechRecognition()) {
                    micBtn.textContent = 'Mic on';
                }
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wire);
    } else {
        wire();
    }
})(window);