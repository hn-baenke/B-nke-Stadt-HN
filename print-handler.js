// ==========================================
// ZENTRALE DRUCK- UND PDF-STEUERUNG (CANVAS-PROXIED-FIX)
// ==========================================

async function getBlobUrl(imageUrl) {
    if (!imageUrl) return null;
    try {
        const response = await fetch(imageUrl, { mode: 'cors' });
        if (!response.ok) throw new Error("Netzwerk-Antwort nicht ok");
        const blob = await response.blob();
        return URL.createObjectURL(blob);
    } catch (e) {
        return imageUrl;
    }
}

window.triggerManualPDFDownload = async function(repId) {
    const reportsList = window.currentReportData || [];
    let rep = null;

    let targetRepId = repId || window.currentSelectedReportId;
    if (targetRepId) {
        rep = reportsList.find(r => String(r.id) === String(targetRepId));
    }

    if (!rep) {
        const modalTextElements = document.querySelectorAll('#report-detail-modal-body h4, #report-detail-modal-body h2, .report-card');
        for (let el of modalTextElements) {
            const text = el.innerText || '';
            const found = reportsList.find(r => r.ticket_number && text.includes(String(r.ticket_number).trim()));
            if (found) {
                rep = found;
                break;
            }
        }
    }

    if (!rep && reportsList.length > 0) {
        rep = reportsList[0];
    }

    if (!rep) {
        alert("Keine Schadensdaten für das PDF gefunden.");
        return;
    }

    let rawImageUrl = rep.image_url || rep.image || rep.photo_url || (rep.benches && rep.benches.image_url);
    let finalImageUrl = null;
    if (rawImageUrl && typeof rawImageUrl === 'string' && rawImageUrl.trim() !== '') {
        finalImageUrl = await getBlobUrl(rawImageUrl);
    }

    const date = rep.created_at ? new Date(rep.created_at).toLocaleString('de-DE') : new Date().toLocaleString('de-DE');
    const b = rep.benches || {};
    const ticket = rep.ticket_number ? String(rep.ticket_number).trim() : 'Meldung';
    const descLower = (rep.description || '').toLowerCase();
    let trupp = 'Allgemein';
    
    if (ticket.includes('H')) trupp = 'Zimmerer';
    else if (ticket.includes('S')) trupp = 'Stadtreinigung';
    else if (ticket.includes('G')) {
        trupp = descLower.includes('zugewachsen') ? 'Grünpflege' : (descLower.includes('irreparabel') ? 'Gala Bau' : 'Grünpflege / Gala Bau');
    }

    const lat = b.lat ? Number(b.lat) : 49.1406;
    const lng = b.lng ? Number(b.lng) : 9.2199;
    const benchId = rep.bench_id || 'Unbekannt';

    const appUrl = window.location.origin + window.location.pathname + `?bench=${benchId}&lat=${lat}&lng=${lng}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(appUrl)}`;

    const zoom = 16;
    const n = Math.pow(2, zoom);
    const xFloat = (lng + 180) / 360 * n;
    const latRad = lat * Math.PI / 180;
    const yFloat = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;

    const xt = Math.floor(xFloat);
    const yt = Math.floor(yFloat);
    const containerWidth = 750; 
    const containerHeight = 230;
    const centerX = containerWidth / 2; 
    const centerY = containerHeight / 2;

    let tilesHtml = '';
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            const tx = xt + dx;
            const ty = yt + dy;
            if (ty >= 0 && ty < n) {
                const tileX = (tx + n) % n;
                const tileUrl = `https://tile.openstreetmap.org/${zoom}/${tileX}/${ty}.png`;
                const cssLeft = Math.round((tx - xFloat) * 256 + centerX);
                const cssTop = Math.round((ty - yFloat) * 256 + centerY);
                tilesHtml += `<img src="${tileUrl}" style="position: absolute; left: ${cssLeft}px; top: ${cssTop}px; width: 256px; height: 256px; display: block; object-fit: cover; background: #e2e8f0;" crossorigin="anonymous" />`;
            }
        }
    }

    const district = b.district || 'Keine Angabe';
    const benchType = b.type || 'Standard';
    const dimensions = (b.dimensions && b.dimensions.trim() !== '') ? '<div style="margin-bottom: 4px;"><strong style="color: #475569;">Maße:</strong> ' + b.dimensions + '</div>' : '';
    const description = (rep.description && rep.description.trim() !== '') ? '<div style="margin-bottom: 4px;"><strong style="color: #475569;">Schaden:</strong> ' + rep.description + '</div>' : '';
    const assemblyNote = (b.assembly_note && b.assembly_note.trim() !== '') ? '<div style="margin-bottom: 4px;"><strong style="color: #475569;">Montagehinweis:</strong> ' + b.assembly_note + '</div>' : '';
    const note = (b.note && b.note.trim() !== '') ? '<div><strong style="color: #475569;">Notiz:</strong> ' + b.note + '</div>' : '';

    const imageHtml = finalImageUrl ? 
        '<div style="margin-bottom: 10px;">' +
            '<h3 style="margin: 0 0 4px 0; font-size: 14px; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; color: #334155;">Foto vom Schaden</h3>' +
            '<div style="display: flex; justify-content: center; background: #f1f5f9; border-radius: 6px; border: 1px solid #cbd5e1; overflow: hidden; max-height: 220px;">' +
                '<img src="' + finalImageUrl + '" style="max-width: 100%; max-height: 220px; object-fit: contain; display: block;" />' +
            '</div>' +
        '</div>' : '';

    let pdfContainer = document.getElementById('pdf-render-container');
    if (!pdfContainer) {
        pdfContainer = document.createElement('div');
        pdfContainer.id = 'pdf-render-container';
        pdfContainer.style.position = 'absolute';
        pdfContainer.style.top = '0';
        pdfContainer.style.left = '0';
        pdfContainer.style.width = '794px';
        pdfContainer.style.zIndex = '-9999';
        pdfContainer.style.background = '#ffffff';
        document.body.appendChild(pdfContainer);
    }

    pdfContainer.innerHTML = `
        <div id="pdf-inner-content" style="padding: 20px; background: #ffffff; width: 794px; box-sizing: border-box; font-family: Arial, sans-serif; color: #000000;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #2C3E50; padding-bottom: 6px; margin-bottom: 10px;">
                <img src="https://aqownulwmwdtrgzmsgqn.supabase.co/storage/v1/object/public/bench-images/hnlogo.png" style="height: 45px; object-fit: contain;" alt="Stadt Heilbronn" crossorigin="anonymous">
                <img src="https://aqownulwmwdtrgzmsgqn.supabase.co/storage/v1/object/public/bench-images/Logo%20SitzFinder.png" style="height: 50px; margin: -4px 0; object-fit: contain;" alt="SitzFinder" crossorigin="anonymous">
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; background: #f8fafc; padding: 10px 15px; border-radius: 6px; border: 1px solid #cbd5e1;">
                <div>
                    <h2 style="margin: 0 0 2px 0; font-size: 18px; color: #1e293b;">Schadensmeldung: ${ticket}</h2>
                    <div style="font-size: 14px; font-weight: bold; color: #2563eb;">Zuständiger Trupp: ${trupp}</div>
                    <div style="font-size: 12px; color: #64748b; margin-top: 2px;">Gemeldet am: ${date}</div>
                </div>
                <div style="text-align: center; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px; display: flex; flex-direction: column; align-items: center;">
                    <img src="${qrCodeUrl}" style="width: 70px; height: 70px; display: block;" alt="QR-Code" crossorigin="anonymous"/>
                    <span style="font-size: 9px; color: #475569; margin-top: 2px; font-weight: bold;">In App öffnen</span>
                </div>
            </div>

            <div style="margin-bottom: 10px;">
                <h3 style="margin: 0 0 4px 0; font-size: 14px; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; color: #334155;">Details zur Bank & Schaden</h3>
                <div style="display: flex; gap: 20px; font-size: 13px; line-height: 1.4;">
                    <div style="flex: 1;">
                        <div style="margin-bottom: 3px;"><strong style="color: #475569;">Bank-ID:</strong> #${benchId}</div>
                        <div style="margin-bottom: 3px;"><strong style="color: #475569;">Stadtteil:</strong> ${district}</div>
                        <div><strong style="color: #475569;">Banktyp:</strong> ${benchType}</div>
                    </div>
                    <div style="flex: 1.2;">
                        ${dimensions}
                        ${description}
                        ${assemblyNote}
                        ${note}
                    </div>
                </div>
            </div>

            ${imageHtml}

            <div style="margin-bottom: 10px;">
                <h3 style="margin: 0 0 4px 0; font-size: 14px; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; color: #334155;">Orientierungskarte</h3>
                <div style="height: ${containerHeight}px; width: ${containerWidth}px; margin: 0 auto; border-radius: 6px; border: 1px solid #cbd5e1; background: #e2e8f0; position: relative; overflow: hidden; box-sizing: border-box;">
                    <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;">
                        ${tilesHtml}
                    </div>
                    <div style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -100%); width: 16px; height: 16px; background-color: #dc2626 !important; border: 3px solid #ffffff; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.5); z-index: 10;"></div>
                </div>
            </div>

            <div style="margin-top: 15px; padding-top: 8px; border-top: 2px dashed #94a3b8;">
                <div style="display: flex; justify-content: space-between; font-size: 11px;">
                    <div style="width: 30%;">
                        <strong>Datum Erledigt:</strong>
                        <div style="border-bottom: 1px solid #000; margin-top: 25px;"></div>
                    </div>
                    <div style="width: 30%;">
                        <strong>Bearbeitet durch:</strong>
                        <div style="border-bottom: 1px solid #000; margin-top: 25px;"></div>
                    </div>
                    <div style="width: 30%;">
                        <strong>Unterschrift:</strong>
                        <div style="border-bottom: 1px solid #000; margin-top: 25px;"></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // 1. Warten, bis alle Bilder vollständig geladen sind
    const images = pdfContainer.querySelectorAll('img');
    await Promise.all(Array.from(images).map(img => {
        if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
        return new Promise(resolve => {
            img.onload = resolve;
            img.onerror = resolve;
        });
    }));

    await new Promise(r => setTimeout(r, 500));

    const targetElement = document.getElementById('pdf-inner-content');
    const rawFilename = `Schadensmeldung_${ticket}.pdf`;
    const cleanFilename = rawFilename.replace(/[^a-zA-Z0-9_\.-]/g, '_');

    try {
        const opt = {
            margin:       0,
            filename:     cleanFilename,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { 
                scale: 2, 
                useCORS: true, 
                allowTaint: true,
                logging: false,
                width: 794
            },
            jsPDF:        { unit: 'pt', format: 'a4', orientation: 'portrait' }
        };

        const pdfBlob = await html2pdf().set(opt).from(targetElement).output('blob');
        
        // Explicit PDF MIME-Type Reslicing
        const cleanBlob = pdfBlob.slice(0, pdfBlob.size, 'application/pdf');

        const file = new File([cleanBlob], cleanFilename, { 
            type: 'application/pdf',
            lastModified: Date.now()
        });

        // Prüfen, ob es ein mobiles Gerät ist (iOS / Android)
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // Nur auf Mobilgeräten das native Teilen-Menü öffnen
    if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({
                files: [file]
            });
            pdfContainer.remove();
            return;
        } catch (shareErr) {
            console.log("Teilen abgebrochen");
        }
    }

    // Auf Desktop (Windows/Mac) ODER als Fallback: Direkt herunterladen
    const blobUrl = URL.createObjectURL(cleanBlob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = cleanFilename; // Hier nutzen wir jetzt korrekt cleanFilename!
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

    pdfContainer.remove();

} catch (err) {
    console.error("Fehler bei der PDF-Erstellung:", err);
    alert("PDF konnte nicht erstellt werden.");
    if (pdfContainer) pdfContainer.remove();
}
};

window.printReport = function(repId) {
    const reportsList = window.currentReportData || [];
    const rep = reportsList.find(r => String(r.id) === String(repId));
    
    if (!rep) {
        alert("Meldungsdaten für den Druck konnten nicht geladen werden.");
        return;
    }

    const date = new Date(rep.created_at).toLocaleString('de-DE');
    const b = rep.benches || {};
    
    const ticket = rep.ticket_number ? String(rep.ticket_number).trim() : 'Keine Nummer';
    const descLower = (rep.description || '').toLowerCase();
    let trupp = 'Allgemein';
    
    if (ticket.includes('H')) trupp = 'Zimmerer';
    else if (ticket.includes('S')) trupp = 'Stadtreinigung';
    else if (ticket.includes('G')) {
        trupp = descLower.includes('zugewachsen') ? 'Grünpflege' : (descLower.includes('irreparabel') ? 'Gala Bau' : 'Grünpflege / Gala Bau');
    }

    const targetBenchId = rep.bench_id;
    const sitzfinderUrl = targetBenchId 
        ? window.location.origin + window.location.pathname + '?id=' + targetBenchId
        : window.location.href;

    // Exakte Koordinaten ermitteln mit Fallback auf Heilbronn-Zentrum
    const lat = (b && b.lat) ? Number(b.lat) : 49.1406;
    const lng = (b && b.lng) ? Number(b.lng) : 9.2199;

    // Zoom 16 für maximale Detailtiefe (Fußwege, Parks, Pfade)
    const zoom = 16;
    const n = Math.pow(2, zoom);
    const xFloat = (lng + 180) / 360 * n;
    const latRad = lat * Math.PI / 180;
    const yFloat = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;

    const xt = Math.floor(xFloat);
    const yt = Math.floor(yFloat);

    const containerWidth = 774; 
    const containerHeight = 260;
    // Wieder exakt die echte geometrische Mitte, damit der GPS-Punkt perfekt sitzt!
    const centerX = containerWidth / 2; 
    const centerY = containerHeight / 2;

    let tilesHtml = '';
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            const tx = xt + dx;
            const ty = yt + dy;
            if (ty >= 0 && ty < n) {
                const tileX = (tx + n) % n;
                const tileUrl = `https://tile.openstreetmap.org/${zoom}/${tileX}/${ty}.png`;
                const cssLeft = Math.round((tx - xFloat) * 256 + centerX);
                const cssTop = Math.round((ty - yFloat) * 256 + centerY);
                tilesHtml += `<img src="${tileUrl}" class="print-map-tile" style="position: absolute; left: ${cssLeft}px; top: ${cssTop}px; width: 256px; height: 256px; display: block; object-fit: cover; background: #e2e8f0;" crossorigin="anonymous" />`;
            }
        }
    }

    const district = b.district || 'Keine Angabe';
    const benchType = b.type || 'Standard';
    const benchId = rep.bench_id || 'Unbekannt';
    const dimensions = (b.dimensions && b.dimensions.trim() !== '') ? '<div style="margin-bottom: 4px;"><strong style="color: #475569;">Maße:</strong> ' + b.dimensions + '</div>' : '';
    const description = (rep.description && rep.description.trim() !== '') ? '<div style="margin-bottom: 4px;"><strong style="color: #475569;">Schaden:</strong> ' + rep.description + '</div>' : '';
    const assemblyNote = (b.assembly_note && b.assembly_note.trim() !== '') ? '<div style="margin-bottom: 4px;"><strong style="color: #475569;">Montagehinweis:</strong> ' + b.assembly_note + '</div>' : '';
    const note = (b.note && b.note.trim() !== '') ? '<div><strong style="color: #475569;">Notiz:</strong> ' + b.note + '</div>' : '';

    const imageHtml = rep.image_url ? 
        '<div style="margin-bottom: 12px;">' +
            '<h3 style="margin: 0 0 6px 0; font-size: 15px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; color: #334155;">Foto vom Schaden</h3>' +
            '<div style="display: flex; justify-content: center; background: #f1f5f9; border-radius: 6px; border: 1px solid #cbd5e1; overflow: hidden; max-height: 270px;">' +
                '<img src="' + rep.image_url + '" style="max-width: 100%; max-height: 270px; object-fit: contain;" crossorigin="anonymous"/>' +
            '</div>' +
        '</div>' : '';

    let printArea = document.getElementById('static-print-area');
    if (!printArea) {
        printArea = document.createElement('div');
        printArea.id = 'static-print-area';
        document.body.appendChild(printArea);
    }

    printArea.style.display = 'block';
    printArea.style.position = 'absolute';
    printArea.style.left = '0';
    printArea.style.top = '0';
    printArea.style.width = '100%';
    printArea.style.opacity = '0';
    printArea.style.zIndex = '-9999';

    printArea.innerHTML = `
        <div style="padding: 10px; background: #fff; font-family: Arial, sans-serif; width: 794px; margin: 0 auto; box-sizing: border-box;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #2C3E50; padding-bottom: 8px; margin-bottom: 12px;">
                <img src="https://aqownulwmwdtrgzmsgqn.supabase.co/storage/v1/object/public/bench-images/hnlogo.png" style="height: 60px; object-fit: contain;" alt="Stadt Heilbronn" crossorigin="anonymous">
                <img src="https://aqownulwmwdtrgzmsgqn.supabase.co/storage/v1/object/public/bench-images/Logo%20SitzFinder.png" style="height: 66px; margin: -4px 0; object-fit: contain;" alt="SitzFinder" crossorigin="anonymous">
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; background: #f8fafc; padding: 12px 18px; border-radius: 6px; border: 1px solid #cbd5e1;">
                <div>
                    <h2 style="margin: 0 0 4px 0; font-size: 22px; color: #1e293b;">Schadensmeldung: ${ticket}</h2>
                    <div style="font-size: 16px; font-weight: bold; color: #2563eb;">Zuständiger Trupp: ${trupp}</div>
                    <div style="font-size: 13px; color: #64748b; margin-top: 4px;">Gemeldet am: ${date}</div>
                </div>
                <div style="text-align: center;">
                    <div id="print-qrcode" style="display: flex; justify-content: center;"></div>
                    <div style="font-size: 10px; color: #64748b; margin-top: 4px; font-weight: bold;">In SitzFinder öffnen</div>
                </div>
            </div>

            <div style="margin-bottom: 12px;">
                <h3 style="margin: 0 0 6px 0; font-size: 15px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; color: #334155;">Details zur Bank & Schaden</h3>
                <div style="display: flex; gap: 24px; font-size: 14px; line-height: 1.5;">
                    <div style="flex: 1;">
                        <div style="margin-bottom: 4px;"><strong style="color: #475569;">Bank-ID:</strong> #${benchId}</div>
                        <div style="margin-bottom: 4px;"><strong style="color: #475569;">Stadtteil:</strong> ${district}</div>
                        <div><strong style="color: #475569;">Banktyp:</strong> ${benchType}</div>
                    </div>
                    <div style="flex: 1.2;">
                        ${dimensions}
                        ${description}
                        ${assemblyNote}
                        ${note}
                    </div>
                </div>
            </div>

            ${imageHtml}

            <!-- KARTE MIT EXAKTEM MITTELPUNKT & PUNKT -->
            <div style="margin-bottom: 12px;" class="print-no-break">
                <h3 style="margin: 0 0 6px 0; font-size: 15px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; color: #334155;">Orientierungskarte</h3>
                <div style="height: ${containerHeight}px; width: ${containerWidth}px; margin: 0 auto; border-radius: 6px; border: 1px solid #cbd5e1; background: #e2e8f0; position: relative; overflow: hidden; box-sizing: border-box;">
                    
                    <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;">
                        ${tilesHtml}
                    </div>

                    <!-- Exakter roter Marker im mathematischen Zentrum -->
                    <div style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -100%); width: 18px; height: 18px; background-color: #dc2626 !important; border: 3px solid #ffffff; border-radius: 50%; box-shadow: 0 3px 6px rgba(0,0,0,0.5); z-index: 10;"></div>
                </div>
            </div>

            <div style="margin-top: 12px; padding-top: 10px; border-top: 2px dashed #94a3b8;" class="print-no-break">
                <div style="display: flex; justify-content: space-between; font-size: 12px;">
                    <div style="width: 30%;">
                        <strong>Datum Erledigt:</strong>
                        <div style="border-bottom: 1px solid #000; margin-top: 40px;"></div>
                    </div>
                    <div style="width: 30%;">
                        <strong>Bearbeitet durch:</strong>
                        <div style="border-bottom: 1px solid #000; margin-top: 40px;"></div>
                    </div>
                    <div style="width: 30%;">
                        <strong>Unterschrift:</strong>
                        <div style="border-bottom: 1px solid #000; margin-top: 40px;"></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const qrContainer = printArea.querySelector("#print-qrcode");
    if (qrContainer) {
        qrContainer.innerHTML = '';
        new QRCode(qrContainer, {
            text: sitzfinderUrl,
            width: 72,
            height: 72,
            correctLevel: QRCode.CorrectLevel.H
        });
    }

    const allImages = Array.from(printArea.querySelectorAll('img'));
    let printTriggered = false;

    const triggerPrint = () => {
        if (printTriggered) return;
        printTriggered = true;

        printArea.style.opacity = '1';
        printArea.style.zIndex = '999999';

        setTimeout(() => {
            window.print();

            setTimeout(() => {
                printArea.style.display = 'none';
                printArea.innerHTML = '';
            }, 1500);
        }, 150);
    };

    if (allImages.length === 0) {
        triggerPrint();
        return;
    }

    Promise.all(allImages.map(img => {
        if (img.complete && img.naturalHeight !== 0) {
            return Promise.resolve();
        }
        if (typeof img.decode === 'function') {
            return img.decode().catch(() => Promise.resolve());
        }
        return new Promise(resolve => {
            img.onload = resolve;
            img.onerror = resolve;
        });
    })).then(triggerPrint).catch(triggerPrint);

    setTimeout(triggerPrint, 2500);
};

// ==========================================
// 1. HILFSFUNKTION: BAUT BEIDE ANSICHTEN KOMPLETT ZUSAMMEN
// ==========================================
function buildCombinedWoodHTML() {
    let districtRequirements = {};
    let benchWiseData = {};
    let projectTitle = "🪵 Holz-Zuschnittliste";

    const activeModal = document.getElementById('active-wood-list-modal');
    const detailModal = document.getElementById('saved-detail-wood-modal');
    const modalToPrint = activeModal || detailModal;

    if (!modalToPrint) return null;

    const titleEl = modalToPrint.querySelector('h3');
    if (titleEl) projectTitle = titleEl.innerText;

    // A) Wenn wir im aktiven Auswahlmodus auf der Karte sind
    if (activeModal && typeof selectedWoodBenchIds !== 'undefined' && selectedWoodBenchIds.size > 0 && typeof benches !== 'undefined') {
        selectedWoodBenchIds.forEach(id => {
            const bench = benches.find(b => b.id === id);
            if (bench) {
                const district = bench.district || 'Unbekannt';
                benchWiseData[id] = { district: district, items: parseBenchDimensionsRaw(bench.dimensions) };
                
                if (!districtRequirements[district]) {
                    districtRequirements[district] = { benchIds: [], dimensions: {} };
                }
                districtRequirements[district].benchIds.push(bench.id);

                benchWiseData[id].items.forEach(item => {
                    const dimKey = item.part ? `${item.part}: ${item.dimension}` : item.dimension;
                    if (!districtRequirements[district].dimensions[dimKey]) {
                        districtRequirements[district].dimensions[dimKey] = { count: 0, benchIds: [] };
                    }
                    districtRequirements[district].dimensions[dimKey].count += item.count;
                    if (!districtRequirements[district].dimensions[dimKey].benchIds.includes(bench.id)) {
                        districtRequirements[district].dimensions[dimKey].benchIds.push(bench.id);
                    }
                });
            }
        });
    } 
    // B) Wenn es ein gespeichertes Projekt aus dem Archiv ist
    else if (window.currentWoodProjectForExport) {
        const rawData = window.currentWoodProjectForExport.project_data || {};
        districtRequirements = rawData.districtRequirements || rawData;
        benchWiseData = rawData.benchWiseData || window.currentWoodProjectForExport.bench_wise_data || {};
        
        if (Object.keys(benchWiseData).length === 0 && window.currentWoodProjectForExport.bench_ids && typeof benches !== 'undefined') {
            window.currentWoodProjectForExport.bench_ids.forEach(id => {
                const bench = benches.find(b => b.id === Number(id));
                if (bench) {
                    benchWiseData[id] = { district: bench.district || 'Unbekannt', items: parseBenchDimensionsRaw(bench.dimensions) };
                }
            });
        }
    }

    // HTML für Seite 1: Nach Bauteilen
    let html = `
        <div style="font-family: Arial, sans-serif; color: #2C3E50; width: 100%;">
            <h2 style="margin-top: 0; color: #2C3E50; border-bottom: 2px solid #2C3E50; padding-bottom: 5px;">${projectTitle}</h2>
            <h3 style="color: #2980b9; margin-top: 15px; margin-bottom: 5px;">📋 Zuschnittliste nach Bauteilen</h3>
    `;

    const sortedDistricts = Object.keys(districtRequirements || {}).sort();
    if (sortedDistricts.length === 0) {
        html += `<p style="color: #7f8c8d;">Keine Maße nach Bauteilen verfügbar.</p>`;
    } else {
        sortedDistricts.forEach(district => {
            const distData = districtRequirements[district];
            const sortedWoodItems = parseAndSortWoodItems(distData.dimensions || {});

            html += `
                <div style="margin-top: 12px; border-bottom: 1px solid #2980b9; padding-bottom: 2px;">
                    <h4 style="margin: 0; color: #2980b9; font-size: 14px;">📍 Stadtteil: ${district} <span style="font-size: 11px; color: #7f8c8d; font-weight: normal;">(Bänke: ${(distData.benchIds || []).map(id => '#' + id).join(', ')})</span></h4>
                </div>
                <table style="width: 100%; border-collapse: collapse; margin-top: 5px; margin-bottom: 10px;">
                    <thead>
                        <tr style="background: #f4f4f4; border-bottom: 1px solid #ddd;">
                            <th style="padding: 5px; text-align: left; font-size: 12px;">Dimension / Maß & Bänke</th>
                            <th style="padding: 5px; text-align: center; width: 70px; font-size: 12px;">Anzahl</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            sortedWoodItems.forEach(item => {
                const labelText = item.hasPart ? `<strong>${item.part}:</strong> ${item.dimension}` : item.dimension;
                let benchTags = "";
                if (item.benchIds && item.benchIds.length > 0) {
                    const sortedIds = [...item.benchIds].sort((a, b) => Number(a) - Number(b));
                    const badges = sortedIds.map(id => `<span style="background: ${getBankColor(id)}; color: white; padding: 1px 4px; border-radius: 3px; font-size: 9px; font-weight: bold; display: inline-block; margin: 1px;">#${id}</span>`).join('');
                    benchTags = `<div style="margin-top: 2px; display: flex; flex-wrap: wrap; gap: 2px; align-items: center;"><span style="font-size: 10px; color: #7f8c8d; margin-right: 2px;">Für Bank:</span> ${badges}</div>`;
                }

                html += `
                    <tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 5px; font-size: 12px; color: #333;">${labelText}${benchTags}</td>
                        <td style="padding: 5px; text-align: center; font-weight: bold; color: #e67e22; font-size: 13px; vertical-align: middle;">${item.count} Stk.</td>
                    </tr>
                `;
            });
            html += `</tbody></table>`;
        });
    }

    // Sauberer Seitenumbruch für Seite 2
    html += `
        <div style="page-break-before: always; break-before: page; margin-top: 30px; padding-top: 10px;"></div>
        <h3 style="color: #2980b9; margin-top: 0; margin-bottom: 10px;">🪑 Einzelübersicht nach Bänken</h3>
    `;

    const sortedBenchIds = Object.keys(benchWiseData || {}).sort((a, b) => Number(a) - Number(b));
    if (sortedBenchIds.length === 0) {
        html += `<p style="color: #7f8c8d;">Keine Einzelbank-Details verfügbar.</p>`;
    } else {
        sortedBenchIds.forEach(id => {
            const data = benchWiseData[id];
            const benchColor = getBankColor(id);

            html += `
                <div style="margin-top: 10px; background: #fafafa; border: 1px solid #ddd; border-left: 5px solid ${benchColor}; border-radius: 4px; padding: 8px 12px; page-break-inside: avoid; break-inside: avoid;">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 4px; margin-bottom: 6px;">
                        <h4 style="margin: 0; color: #2c3e50; font-size: 14px;">🪑 Bank <span style="background: ${benchColor}; color: white; padding: 1px 5px; border-radius: 3px;">#${id}</span></h4>
                        <span style="font-size: 11px; color: #7f8c8d;">📍 Stadtteil: ${data.district || 'Unbekannt'}</span>
                    </div>
            `;

            if (!data.items || data.items.length === 0) {
                html += `<p style="margin: 2px 0; font-size: 11px; color: #e74c3c;">Keine Maße hinterlegt.</p>`;
            } else {
                html += `<ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #333;">`;
                data.items.forEach(i => {
                    const partLabel = i.part ? `<strong>${i.part}:</strong> ` : '';
                    html += `<li style="margin-bottom: 2px;">${partLabel}${i.dimension} &nbsp;&rightarrow;&nbsp; <strong style="color: #e67e22;">${i.count} Stk.</strong></li>`;
                });
                html += `</ul>`;
            }

            html += `</div>`;
        });
    }

    html += `</div>`;
    return html;
}


// ==========================================
// 2. ISOLIERTER DRUCK ÜBER SEPARATES POPUP-FENSTER
// ==========================================
window.printWoodCuttingListPopup = function() {
    const combinedHTML = buildCombinedWoodHTML();
    if (!combinedHTML) {
        alert("Keine Zuschnittliste gefunden zum Drucken.");
        return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert("Das Druckfenster wurde vom Browser blockiert. Bitte erlaube Pop-ups für diese Seite.");
        return;
    }

    printWindow.document.open();
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Holz-Zuschnittliste Drucken</title>
            <style>
                * {
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                    color-adjust: exact !important;
                }
                body {
                    font-family: Arial, sans-serif;
                    margin: 20px;
                    background: #ffffff;
                    color: #000000;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 8px;
                    margin-bottom: 15px;
                }
                th, td {
                    border: 1px solid #ddd;
                    padding: 6px;
                }
                th {
                    background: #f4f4f4 !important;
                    text-align: left;
                }
                @media print {
                    body { margin: 0; padding: 10px; }
                }
            </style>
        </head>
        <body>
            ${combinedHTML}
            <script>
                window.onload = function() {
                    window.print();
                    setTimeout(function() { window.close(); }, 500);
                };
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
};


// ==========================================
// 3. UNIVERSELLER PDF-DOWNLOAD & SHARE-WEG
// ==========================================
window.triggerManualWoodPDFDownload = async function() {
    console.log("1. Starte PDF-Export...");
    
    const combinedHTML = buildCombinedWoodHTML();
    if (!combinedHTML) {
        alert("Keine Zuschnittliste gefunden.");
        return;
    }

    // Projekttitel aus dem aktiven Modal oder aus dem gespeicherten Objekt ermitteln
    let rawTitle = "Holz_Zuschnittliste";
    const activeModal = document.getElementById('active-wood-list-modal');
    const detailModal = document.getElementById('saved-detail-wood-modal');
    const modalToPrint = activeModal || detailModal;

    if (modalToPrint) {
        const titleEl = modalToPrint.querySelector('h3');
        if (titleEl && titleEl.innerText.trim()) {
            rawTitle = titleEl.innerText.trim();
        }
    } else if (window.currentWoodProjectForExport && window.currentWoodProjectForExport.name) {
        rawTitle = window.currentWoodProjectForExport.name;
    }

    // Titel für den Dateinamen bereinigen (Emojis & unerlaubte Zeichen entfernen/ersetzen)
    let cleanTitle = rawTitle
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '') // Emojis entfernen
        .trim()
        .replace(/[^a-zA-Z0-9äöüÄÖÜß_\-\s]/g, '') // Nur sichere Zeichen behalten
        .replace(/\s+/g, '_');                   // Leerzeichen durch Unterstriche ersetzen

    if (!cleanTitle) cleanTitle = "Holz_Zuschnittliste";

    const filename = `${cleanTitle}.pdf`;

    // Wrapper mit leicht angepasster Breite (740px), damit rechts nichts abgeschnitten wird
    const wrappedHTML = `
        <div style="width: 740px; background: #ffffff; padding: 10px; box-sizing: border-box; font-family: Arial, sans-serif; color: #000000; overflow: hidden;">
            ${combinedHTML}
        </div>
    `;

    const opt = {
        margin:       [20, 20, 20, 20],
        filename:     filename,
        image:        { type: 'jpeg', quality: 0.95 },
        html2canvas:  { 
            scale: 1.5, 
            useCORS: true, 
            allowTaint: true,
            logging: false,
            letterRendering: true
        },
        jsPDF:        { unit: 'pt', format: 'a4', orientation: 'portrait' },
        pagebreak:    { mode: ['css', 'legacy'], avoid: ['tr', 'div'] }
    };

    try {
        console.log(`2. Generiere PDF mit Dateiname: ${filename}...`);
        await html2pdf().set(opt).from(wrappedHTML).save();
        console.log("3. PDF-Download erfolgreich ausgelöst!");
    } catch (err) {
        console.error("Fehler bei der PDF-Erstellung:", err);
        alert("PDF konnte nicht erstellt werden: " + err.message);
    }
};