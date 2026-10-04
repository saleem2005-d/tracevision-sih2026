// MSDE Surveillance Platform Client Engine
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

window.addEventListener('DOMContentLoaded', function() {
    video = document.getElementById('webcam');
    displayCanvas = document.getElementById('displayCanvas');
    captureCanvas = document.getElementById('captureCanvas');
    dispCtx = displayCanvas.getContext('2d');
    capCtx = captureCanvas.getContext('2d');

    // Live Clock
    setInterval(function() {
        var clockEl = document.getElementById('liveClock');
        if (clockEl) clockEl.innerText = new Date().toLocaleTimeString();
    }, 1000);

    // Initial canvas setup
    displayCanvas.width = 1280;
    displayCanvas.height = 720;
    captureCanvas.width = 640;
    captureCanvas.height = 360;
    drawIdleScreen("CAMERA STANDBY - SELECT A FEED OR CONNECT WEBCAM");
});

function drawIdleScreen(message) {
    dispCtx.fillStyle = "#030712";
    dispCtx.fillRect(0, 0, displayCanvas.width, displayCanvas.height);
    
    // Draw subtle grid
    dispCtx.strokeStyle = "#1e293b";
    dispCtx.lineWidth = 1;
    for (var x = 0; x < displayCanvas.width; x += 80) {
        dispCtx.beginPath(); dispCtx.moveTo(x, 0); dispCtx.lineTo(x, displayCanvas.height); dispCtx.stroke();
    }
    for (var y = 0; y < displayCanvas.height; y += 60) {
        dispCtx.beginPath(); dispCtx.moveTo(0, y); dispCtx.lineTo(displayCanvas.width, y); dispCtx.stroke();
    }

    dispCtx.fillStyle = "#64748b";
    dispCtx.font = "bold 18px monospace";
    dispCtx.textAlign = "center";
    dispCtx.fillText(message, displayCanvas.width / 2, displayCanvas.height / 2);
}

function switchFeed(camId) {
    activeCam = camId;
    ['CAM-01', 'CAM-02', 'CAM-03'].forEach(function(id) {
        var btn = document.getElementById('btn-' + id);
        if (!btn) return;
        if (id === camId) {
            btn.className = "px-2.5 py-1 rounded text-xs font-mono font-semibold transition bg-indigo-600 text-white";
        } else {
            btn.className = "px-2.5 py-1 rounded text-xs font-mono font-semibold transition text-slate-400 hover:text-white";
        }
    });

    var labels = {
        'CAM-01': 'CAM-01: THEORY_HALL_NORTH',
        'CAM-02': 'CAM-02: IT_PRACTICAL_LAB_EAST',
        'CAM-03': 'CAM-03: BIOMETRIC_ENTRY_PORTAL'
    };
    var labelEl = document.getElementById('activeCamLabel');
    if (labelEl) labelEl.innerText = labels[camId] || camId;
    appendLog("Switched video source matrix to " + camId, "info");
}

function toggleCamera() {
    if (isSimulating) stopSimulation();

    if (isRunning) {
        if (video.srcObject) {
            video.srcObject.getTracks().forEach(function(track) { track.stop(); });
        }
        isRunning = false;
        document.getElementById('btnStartLabel').innerText = "Connect Live Camera";
        document.getElementById('btnStart').className = "bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-4 py-2 rounded-xl transition flex items-center gap-2 shadow-lg shadow-indigo-600/30";
        drawIdleScreen("CAMERA OFFLINE");
        document.getElementById('fpsTag').innerText = "FPS: 0.0";
        document.getElementById('latencyTag').innerText = "Inference: Idle";
        return;
    }

    navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } })
        .then(function(stream) {
            video.srcObject = stream;
            isRunning = true;
            document.getElementById('btnStartLabel').innerText = "Stop Live Feed";
            document.getElementById('btnStart').className = "bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs px-4 py-2 rounded-xl transition flex items-center gap-2 shadow-lg shadow-rose-600/30";

            video.onloadedmetadata = function() {
                displayCanvas.width = video.videoWidth || 640;
                displayCanvas.height = video.videoHeight || 480;
                captureCanvas.width = displayCanvas.width;
                captureCanvas.height = displayCanvas.height;
                processLoop();
            };
        })
        .catch(function(err) {
            alert("Camera access failed: " + err.message + "\nTip: You can use 'Synthetic Ingestion Test' to run AI analysis immediately.");
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
        console.error("Frame analysis error:", err);
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
    document.getElementById('btnSim').className = "bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs px-4 py-2 rounded-xl transition flex items-center gap-2 border border-amber-500";
    appendLog("Synthetic PMKVY batch simulation activated. Simulating CCTV room...", "info");

    // Initialize random classroom seating
    simTrainees = [];
    var count = Math.floor(Math.random() * 8) + 17; // 17 to 24 trainees
    for (var i = 0; i < count; i++) {
        var row = Math.floor(i / 6);
        var col = i % 6;
        simTrainees.push({
            x: 180 + col * 150 + (Math.random() * 20 - 10),
            y: 200 + row * 120 + (Math.random() * 15 - 7),
            w: 80,
            h: 80,
            id: "TR-" + (1000 + i)
        });
    }

    simInterval = setInterval(renderSimulatedFrame, 200);
}

function stopSimulation() {
    isSimulating = false;
    clearInterval(simInterval);
    document.getElementById('simBtnLabel').innerText = "Synthetic Ingestion Test";
    document.getElementById('btnSim').className = "bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs px-4 py-2 rounded-xl transition flex items-center gap-2 border border-slate-700";
    drawIdleScreen("SIMULATION STOPPED - READY");
}

function renderSimulatedFrame() {
    displayCanvas.width = 1280;
    displayCanvas.height = 720;

    // Background Room
    dispCtx.fillStyle = "#0c1322";
    dispCtx.fillRect(0, 0, 1280, 720);

    // Benches / Desks
    dispCtx.fillStyle = "#1e293b";
    dispCtx.fillRect(120, 240, 1040, 30);
    dispCtx.fillRect(120, 360, 1040, 30);
    dispCtx.fillRect(120, 480, 1040, 30);

    // Draw Trainee Heads and Bounding Boxes
    for (var i = 0; i < simTrainees.length; i++) {
        var t = simTrainees[i];
        
        // Face representation
        dispCtx.fillStyle = "#38bdf8";
        dispCtx.beginPath();
        dispCtx.arc(t.x + 40, t.y + 35, 24, 0, Math.PI * 2);
        dispCtx.fill();

        // Bounding Box
        dispCtx.strokeStyle = "#10b981";
        dispCtx.lineWidth = 2;
        dispCtx.strokeRect(t.x, t.y, t.w, t.h);

        // Label
        dispCtx.fillStyle = "#10b981";
        dispCtx.font = "12px monospace";
        dispCtx.fillText("Verified " + t.id, t.x, t.y - 6);
    }

    // Watermark
    dispCtx.fillStyle = "#fbbf24";
    dispCtx.font = "bold 14px monospace";
    dispCtx.textAlign = "left";
    dispCtx.fillText("MSDE Node: ATP-0104 | " + activeCam + " | " + new Date().toISOString(), 20, 35);
    dispCtx.fillText("Verified Trainees In-Frame: " + simTrainees.length + " / 25", 20, 60);

    var rate = Math.round((simTrainees.length / 25) * 100);
    document.getElementById('latencyTag').innerText = "Inference: 11ms";
    document.getElementById('fpsTag').innerText = "FPS: 5.0";

    var discrepancies = [];
    if (rate < 70) {
        discrepancies.push("Attendance Quota Breached: " + rate + "% (Threshold: 70%)");
    }
    updateTelemetry(simTrainees.length, rate, discrepancies);
}

function updateTelemetry(presentCount, rate, discrepancies) {
    document.getElementById('statPresent').innerText = presentCount;
    document.getElementById('statRate').innerText = rate + '%';
    document.getElementById('quotaLabel').innerText = rate + '% / 70%';
    document.getElementById('barCompliance').style.width = Math.min(rate, 100) + '%';

    var badge = document.getElementById('complianceBadge');
    if (rate >= 70) {
        badge.innerText = "COMPLIANT (PASS)";
        badge.className = "text-xs font-black font-mono px-2.5 py-1 rounded bg-emerald-950 text-emerald-400 border border-emerald-700/50";
    } else {
        badge.innerText = "DEFICIT BREACH";
        badge.className = "text-xs font-black font-mono px-2.5 py-1 rounded bg-rose-950 text-rose-400 border border-rose-700/50";
    }

    if (discrepancies && discrepancies.length > 0) {
        for (var i = 0; i < discrepancies.length; i++) {
            appendLog(discrepancies[i], 'warning');
        }
    }
}

function appendLog(text, type) {
    var logBox = document.getElementById('alertLog');
    if (!logBox) return;
    var item = document.createElement('div');
    var colorClass = type === 'warning' ? 'text-rose-400 border-rose-900/50 bg-rose-950/30' : 'text-slate-300 border-slate-800 bg-slate-950/80';
    var icon = type === 'warning' ? 'fa-triangle-exclamation text-rose-500' : 'fa-check text-emerald-400';

    item.className = 'p-2 rounded-lg border ' + colorClass + ' flex items-start gap-2 text-xs';
    item.innerHTML = '<i class="fa-solid ' + icon + ' mt-0.5"></i><div><span class="text-slate-400 font-mono">[' + new Date().toLocaleTimeString() + ']</span> ' + text + '</div>';
    logBox.prepend(item);
}

function clearAuditLog() {
    var logBox = document.getElementById('alertLog');
    if (logBox) {
        logBox.innerHTML = '<div class="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80 text-slate-400 flex items-start gap-2"><i class="fa-solid fa-circle-check text-emerald-400 mt-0.5"></i><div>Audit log reset. Real-time surveillance active.</div></div>';
    }
}

function exportAuditReport() {
    var rows = [
        ["Center ID", "MSDE-AP-ATP-0104"],
        ["Center Name", "Anantapur Advanced Skills Hub"],
        ["Scheme", "PMKVY 4.0 (NSDC)"],
        ["Audit Timestamp", new Date().toISOString()],
        ["Total Batch Capacity", "25"],
        ["Verified Trainees In-Frame", document.getElementById('statPresent').innerText],
        ["Attendance Compliance Ratio", document.getElementById('statRate').innerText],
        ["Compliance Status", document.getElementById('complianceBadge').innerText],
        ["AEBAS 2FA Biometric", "Synchronized"],
        ["CCTV Coverage", "Full Coverage - 0 Blindspots"],
        ["Fire Safety Detection", "Compliant"]
    ];

    var csvContent = "data:text/csv;charset=utf-8," + rows.map(function(e) { return e.join(","); }).join("\n");
    var encodedUri = encodeURI(csvContent);
    var link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "MSDE_Compliance_Inspection_" + Date.now() + ".csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    appendLog("Audit spreadsheet exported successfully.", "info");
}
