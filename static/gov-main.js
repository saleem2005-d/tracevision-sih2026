// TraceVision Client Engine
var video = null;
var displayCanvas = null;
var captureCanvas = null;
var dispCtx = null;
var capCtx = null;

var isRunning = false;
var isSimulating = false;
var simInterval = null;
var activeCam = 'CAM-01';
var frameCount = 0;
var lastFpsTime = performance.now();
var simTrainees = [];

function navigateTo(viewId, title) {
    var views = document.querySelectorAll('.view-section');
    for (var i = 0; i < views.length; i++) {
        views[i].classList.remove('active');
    }

    var target = document.getElementById('view-' + viewId);
    if (target) {
        target.classList.add('active');
    }

    var bc = document.getElementById('breadcrumbCurrent');
    if (bc) bc.innerText = title;

    var items = document.querySelectorAll('.sidebar-item');
    for (var j = 0; j < items.length; j++) {
        items[j].classList.remove('active');
    }
    var activeNav = document.getElementById('nav-' + viewId);
    if (activeNav) {
        activeNav.classList.add('active');
    }

    appendLog("Navigated to: " + title, "info");
}

window.addEventListener('DOMContentLoaded', function() {
    video = document.getElementById('webcam');
    displayCanvas = document.getElementById('displayCanvas');
    captureCanvas = document.getElementById('captureCanvas');
    dispCtx = displayCanvas.getContext('2d');
    capCtx = captureCanvas.getContext('2d');

    setInterval(function() {
        var clock = document.getElementById('liveClock');
        if (clock) clock.innerText = new Date().toLocaleTimeString('en-IN', { hour12: true });
    }, 1000);

    displayCanvas.width = 1280;
    displayCanvas.height = 720;
    captureCanvas.width = 640;
    captureCanvas.height = 360;
    drawStandbyScreen("STANDBY: SELECT CAMERA FEED OR START LIVE VERIFICATION");

    buildTraineeRegistry();
});

function buildTraineeRegistry() {
    var tbody = document.getElementById('traineeRows');
    if (!tbody) return;
    tbody.innerHTML = '';

    for (var i = 1; i <= 25; i++) {
        var idStr = "TR-2026-" + (i < 10 ? "0" + i : i);
        var tr = document.createElement('tr');
        tr.innerHTML = '<td><strong>' + idStr + '</strong></td>' +
                       '<td><span class="badge-status badge-pass">SYNCED</span></td>' +
                       '<td class="ai-verify-cell"><span class="badge-status badge-warn">PENDING</span></td>' +
                       '<td class="ai-status-cell">Awaiting Frame Scan</td>' +
                       '<td>' + new Date().toLocaleTimeString('en-IN') + '</td>';
        tbody.appendChild(tr);
    }
}

function filterTrainees() {
    var q = document.getElementById('traineeSearch').value.toLowerCase();
    var rows = document.getElementById('traineeRows').getElementsByTagName('tr');
    for (var i = 0; i < rows.length; i++) {
        var text = rows[i].textContent.toLowerCase();
        rows[i].style.display = text.indexOf(q) > -1 ? '' : 'none';
    }
}

function drawStandbyScreen(text) {
    dispCtx.fillStyle = "#0c1825";
    dispCtx.fillRect(0, 0, displayCanvas.width, displayCanvas.height);

    dispCtx.strokeStyle = "#1b2c40";
    dispCtx.lineWidth = 1;
    for (var x = 0; x < displayCanvas.width; x += 80) {
        dispCtx.beginPath(); dispCtx.moveTo(x, 0); dispCtx.lineTo(x, displayCanvas.height); dispCtx.stroke();
    }
    for (var y = 0; y < displayCanvas.height; y += 60) {
        dispCtx.beginPath(); dispCtx.moveTo(0, y); dispCtx.lineTo(displayCanvas.width, y); dispCtx.stroke();
    }

    dispCtx.fillStyle = "#ffffff";
    dispCtx.font = "bold 18px -apple-system, sans-serif";
    dispCtx.textAlign = "center";
    dispCtx.fillText(text, displayCanvas.width / 2, displayCanvas.height / 2);

    dispCtx.fillStyle = "#8fa3b8";
    dispCtx.font = "13px monospace";
    dispCtx.fillText("TRACEVISION CORE | ACTIVE SURVEILLANCE NODE", displayCanvas.width / 2, (displayCanvas.height / 2) + 30);
}

function switchFeed(camId) {
    activeCam = camId;
    ['CAM-01', 'CAM-02', 'CAM-03'].forEach(function(id) {
        var btn = document.getElementById('btn-' + id);
        if (!btn) return;
        if (id === camId) {
            btn.className = "btn-gov";
        } else {
            btn.className = "btn-gov btn-gov-secondary";
        }
    });

    var labels = {
        'CAM-01': 'CAM 1: Theory Room (Active)',
        'CAM-02': 'CAM 2: IT Lab (Active)',
        'CAM-03': 'CAM 3: Biometric Entry (Active)'
    };
    var labelEl = document.getElementById('activeCamLabel');
    if (labelEl) labelEl.innerText = labels[camId] || camId;
    appendLog("Video feed switched to " + camId, "info");
}

function toggleCamera() {
    if (isSimulating) stopSimulation();

    if (isRunning) {
        if (video.srcObject) {
            video.srcObject.getTracks().forEach(function(t) { t.stop(); });
        }
        isRunning = false;
        document.getElementById('btnStartLabel').innerText = "Connect Hardware Webcam";
        document.getElementById('btnStart').className = "btn-gov";
        drawStandbyScreen("CAMERA HARDWARE OFFLINE - READY");
        document.getElementById('fpsTag').innerText = "FPS: 0.0";
        document.getElementById('latencyTag').innerText = "Engine: Idle";
        return;
    }

    navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } })
        .then(function(stream) {
            video.srcObject = stream;
            isRunning = true;
            document.getElementById('btnStartLabel').innerText = "Disconnect Webcam";
            document.getElementById('btnStart').className = "btn-gov btn-gov-danger";

            video.onloadedmetadata = function() {
                displayCanvas.width = video.videoWidth || 640;
                displayCanvas.height = video.videoHeight || 480;
                captureCanvas.width = displayCanvas.width;
                captureCanvas.height = displayCanvas.height;
                processLoop();
            };
        })
        .catch(function(err) {
            alert("Hardware Camera Unavailable: " + err.message + "\n\nTip: Click 'Run Synthetic Classroom Test' to evaluate detection and telemetry immediately.");
        });
}

function processLoop() {
    if (!isRunning) return;

    var startTime = performance.now();
    capCtx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
    var dataUrl = captureCanvas.toDataURL('image/jpeg', 0.65);
    var base64Data = dataUrl.split(',')[1];

    fetch('/api/v1/analyze_frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64Data, camera_id: activeCam })
    })
    .then(function(res) { return res.json(); })
    .then(function(res) {
        var latency = Math.round(performance.now() - startTime);
        document.getElementById('latencyTag').innerText = 'Inference: ' + latency + 'ms';

        frameCount++;
        var now = performance.now();
        if (now - lastFpsTime >= 1000) {
            var currentFps = (frameCount * 1000 / (now - lastFpsTime)).toFixed(1);
            document.getElementById('fpsTag').innerText = 'FPS: ' + currentFps;
            frameCount = 0;
            lastFpsTime = now;
        }

        var img = new Image();
        img.onload = function() {
            dispCtx.drawImage(img, 0, 0, displayCanvas.width, displayCanvas.height);
        };
        img.src = 'data:image/jpeg;base64,' + res.processed_image;

        updateTelemetry(res.detected_heads, res.attendance_percentage, res.discrepancies);
    })
    .catch(function(err) {
        console.error("Frame Inference Error:", err);
    });

    setTimeout(processLoop, 250);
}

function triggerSimulatedAudit() {
    if (isRunning) toggleCamera();

    if (isSimulating) {
        stopSimulation();
        return;
    }

    isSimulating = true;
    document.getElementById('simBtnLabel').innerText = "Stop Simulation";
    document.getElementById('btnSim').className = "btn-gov btn-gov-danger";
    appendLog("Synthetic classroom test active. Simulating batch verification...", "info");

    simTrainees = [];
    var count = Math.floor(Math.random() * 6) + 19; // 19 to 24 trainees
    for (var i = 0; i < count; i++) {
        var row = Math.floor(i / 6);
        var col = i % 6;
        simTrainees.push({
            x: 180 + col * 150 + (Math.random() * 16 - 8),
            y: 200 + row * 130 + (Math.random() * 12 - 6),
            w: 80,
            h: 85,
            id: "TR-2026-" + (i < 9 ? "0" + (i + 1) : (i + 1))
        });
    }

    simInterval = setInterval(renderSimulatedFrame, 200);
}

function stopSimulation() {
    isSimulating = false;
    clearInterval(simInterval);
    document.getElementById('simBtnLabel').innerText = "Run Synthetic Classroom Test";
    document.getElementById('btnSim').className = "btn-gov btn-gov-secondary";
    drawStandbyScreen("SIMULATION STOPPED - READY");
}

function renderSimulatedFrame() {
    displayCanvas.width = 1280;
    displayCanvas.height = 720;

    dispCtx.fillStyle = "#121d2b";
    dispCtx.fillRect(0, 0, 1280, 720);

    dispCtx.fillStyle = "#25384d";
    dispCtx.fillRect(100, 250, 1080, 25);
    dispCtx.fillRect(100, 380, 1080, 25);
    dispCtx.fillRect(100, 510, 1080, 25);

    for (var i = 0; i < simTrainees.length; i++) {
        var t = simTrainees[i];

        dispCtx.fillStyle = "#38bdf8";
        dispCtx.beginPath();
        dispCtx.arc(t.x + 40, t.y + 35, 25, 0, Math.PI * 2);
        dispCtx.fill();

        dispCtx.strokeStyle = "#138808";
        dispCtx.lineWidth = 2;
        dispCtx.strokeRect(t.x, t.y, t.w, t.h);

        dispCtx.fillStyle = "#138808";
        dispCtx.font = "bold 12px monospace";
        dispCtx.fillText("Verified " + t.id, t.x, t.y - 6);
    }

    dispCtx.fillStyle = "rgba(0, 0, 0, 0.75)";
    dispCtx.fillRect(15, 15, 540, 60);

    dispCtx.fillStyle = "#ff9933";
    dispCtx.font = "bold 13px monospace";
    dispCtx.textAlign = "left";
    dispCtx.fillText("TRACEVISION CORE | ACTIVE SURVEILLANCE NODE", 25, 36);

    dispCtx.fillStyle = "#ffffff";
    dispCtx.font = "12px monospace";
    dispCtx.fillText("GEO-STAMP: 14.6819 N, 77.6006 E | " + new Date().toISOString(), 25, 58);

    var rate = Math.round((simTrainees.length / 25) * 100);
    document.getElementById('latencyTag').innerText = "Inference: 11ms";
    document.getElementById('fpsTag').innerText = "FPS: 5.0";

    var discrepancies = [];
    if (rate < 70) {
        discrepancies.push("Attendance Quota Breached (" + rate + "% vs 70% threshold)");
    }
    updateTelemetry(simTrainees.length, rate, discrepancies);

    updateRegistryLive(simTrainees.length);
}

function updateRegistryLive(presentCount) {
    var rows = document.getElementById('traineeRows').getElementsByTagName('tr');
    for (var i = 0; i < rows.length; i++) {
        var verifyCell = rows[i].querySelector('.ai-verify-cell');
        var statusCell = rows[i].querySelector('.ai-status-cell');
        if (i < presentCount) {
            if (verifyCell) verifyCell.innerHTML = '<span class="badge-status badge-pass">CONFIRMED</span>';
            if (statusCell) statusCell.innerHTML = '<strong style="color: #138808;">Present (Optical Verified)</strong>';
        } else {
            if (verifyCell) verifyCell.innerHTML = '<span class="badge-status badge-fail">ABSENT</span>';
            if (statusCell) statusCell.innerHTML = '<span style="color: #c92a2a;">Unverified In-Frame</span>';
        }
    }
}

function updateTelemetry(presentCount, rate, discrepancies) {
    document.getElementById('statPresent').innerText = presentCount;
    document.getElementById('statRate').innerText = rate + '%';
    document.getElementById('quotaText').innerText = rate + '% / 70%';
    document.getElementById('quotaBarLabel').innerText = rate + '% Complete';
    document.getElementById('barCompliance').style.width = Math.min(rate, 100) + '%';

    var badge = document.getElementById('complianceBadge');
    var quotaBadge = document.getElementById('quotaBadge');

    if (rate >= 70) {
        badge.innerText = "COMPLIANT";
        badge.className = "badge-status badge-pass";
        quotaBadge.innerText = "PASS";
        quotaBadge.className = "badge-status badge-pass";
    } else {
        badge.innerText = "DEFICIT";
        badge.className = "badge-status badge-fail";
        quotaBadge.innerText = "DEFICIT";
        quotaBadge.className = "badge-status badge-fail";
    }

    if (discrepancies && discrepancies.length > 0) {
        for (var i = 0; i < discrepancies.length; i++) {
            appendLog(discrepancies[i], 'warning');
        }
    }
}

function appendLog(text, type) {
    ['alertLog', 'fullAlertLog'].forEach(function(boxId) {
        var box = document.getElementById(boxId);
        if (!box) return;

        var row = document.createElement('div');
        row.className = 'log-row';
        var colorStyle = type === 'warning' ? 'color: #c92a2a; font-weight: bold;' : 'color: #0e2a47;';
        var icon = type === 'warning' ? '<i class="fa-solid fa-triangle-exclamation" style="color: #c92a2a;"></i>' : '<i class="fa-solid fa-circle-check" style="color: #138808;"></i>';

        row.innerHTML = '<div class="log-time">[' + new Date().toLocaleTimeString('en-IN') + ']</div>' +
                        '<div style="' + colorStyle + '">' + icon + ' ' + text + '</div>';
        box.prepend(row);
    });
}

function clearAuditLog() {
    ['alertLog', 'fullAlertLog'].forEach(function(boxId) {
        var box = document.getElementById(boxId);
        if (box) {
            box.innerHTML = '<div class="log-row"><div class="log-time">[' + new Date().toLocaleTimeString('en-IN') + ']</div><div>Log cleared. Continuous tracking active.</div></div>';
        }
    });
}

function exportAuditReport() {
    var rows = [
        ["SYSTEM", "TRACEVISION CONTINUOUS MONITORING SYSTEM"],
        ["MODULE", "AI-Based Training Centre Vigilance & Infrastructure Audit"],
        ["INSPECTION TIMESTAMP", new Date().toISOString()],
        ["TOTAL ENROLLED IN BATCH", "25"],
        ["ACTIVE DETECTED TRAINEES", document.getElementById('statPresent').innerText],
        ["COMPLIANCE RATIO", document.getElementById('statRate').innerText],
        ["STATUS", document.getElementById('complianceBadge').innerText]
    ];

    var csvContent = "data:text/csv;charset=utf-8," + rows.map(function(e) { return e.join(","); }).join("\n");
    var encodedUri = encodeURI(csvContent);
    var link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "TraceVision_Audit_Report_" + Date.now() + ".csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    appendLog("TraceVision audit record downloaded as CSV.", "info");
}
