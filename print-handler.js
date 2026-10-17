// ==========================================
// ZENTRALE DRUCK- UND PDF-STEUERUNG (CANVAS-VISIBILITY-FIX)
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

    // Render-Container im sichtbaren DOM platzieren, aber hinter einem Fix-Layer verstecken
    let pdfContainer = document.getElementById('pdf-render-container');
    if (!pdfContainer) {
        pdfContainer = document.createElement('div');
        pdfContainer.id = 'pdf-render-container';
        pdfContainer.style.position = 'fixed';
        pdfContainer.style.top = '0';
        pdfContainer.style.left = '0';
        pdfContainer.style.width = '794px';
        pdfContainer.style.zIndex = '-1'; // Hinter der UI verbergen
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

    // 1. Warten auf das Laden aller Bilder
    const images = pdfContainer.querySelectorAll('img');
    await Promise.all(Array.from(images).map(img => {
        if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
        return new Promise(resolve => {
            img.onload = resolve;
            img.onerror = resolve;
        });
    }));

    await new Promise(r => setTimeout(r, 400));

    const targetElement = document.getElementById('pdf-inner-content');
    const filename = `Schadensmeldung_${ticket}.pdf`;
    
    const opt = {
        margin:       0,
        filename:     filename,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { 
            scale: 2, 
            useCORS: true, 
            logging: true,
            scrollX: 0,
            scrollY: 0
        },
        jsPDF:        { unit: 'pt', format: 'a4', orientation: 'portrait' }
    };

    try {
        const pdfBlob = await html2pdf().set(opt).from(targetElement).output('blob');
        const file = new File([pdfBlob], filename, { type: 'application/pdf' });

        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

        if (isIOS && navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: filename
            });
            pdfContainer.remove();
            return;
        }

        // Fallback für Windows / Android
        const blobUrl = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
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

function printWoodCuttingList() {
    // 1. Offenes Modal finden
    const activeModal = document.getElementById('active-wood-list-modal');
    const detailModal = document.getElementById('saved-detail-wood-modal');
    const modalToPrint = activeModal || detailModal;
    
    if (!modalToPrint) {
        alert("Keine Zuschnittliste gefunden zum Drucken.");
        return;
    }

    // 2. Prüfen oder Erstellen unseres unsichtbaren Druck-Containers im Dokument
    let printArea = document.getElementById('static-print-area');
    if (!printArea) {
        printArea = document.createElement('div');
        printArea.id = 'static-print-area';
        printArea.style.display = 'none'; // Im Normalbetrieb unsichtbar
        document.body.appendChild(printArea);
    }

    // 3. Inhalt des Modals kopieren (Cloning - völlig ohne HTML-Schreibarbeit!)
    printArea.innerHTML = '';
    const modalClone = modalToPrint.cloneNode(true);
    
    // Innere Box-Styles anpassen, damit sie auf dem Papier formatfüllend ist
    const innerBox = modalClone.querySelector('div');
    if (innerBox) {
        innerBox.style.boxShadow = 'none';
        innerBox.style.width = '100%';
        innerBox.style.maxHeight = 'none';
        innerBox.style.padding = '10px';
    }

    printArea.appendChild(modalClone);

    // 4. Drucken aufrufen (das CSS oben blendet alles andere aus)
    window.print();

    // 5. Nach kurzer Verzögerung wieder aufräumen
    setTimeout(() => {
        printArea.innerHTML = '';
    }, 1000);
}

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