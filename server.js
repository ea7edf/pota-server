const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');

const app = express();
app.use(express.json()); 

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const DB_PATH = path.join(DATA_DIR, 'database.sqlite');
const BG_PATH = path.join(DATA_DIR, 'qsl_fondo.jpg');

const db = new sqlite3.Database(DB_PATH);
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS contactos (id INTEGER PRIMARY KEY AUTOINCREMENT, indicativo TEXT, frecuencia TEXT, modo TEXT, nombre TEXT, qth TEXT, fecha TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS qrz_mundial (indicativo TEXT PRIMARY KEY, nombre TEXT, qth TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS actividad_actual (id INTEGER PRIMARY KEY, mi_indicativo TEXT, tipo TEXT, referencia TEXT, mi_grid TEXT, mi_lat REAL, mi_lon REAL)`);
});

function gridACoordenadas(gridStr) {
    if (!gridStr || gridStr.length < 4) return { lat: 40.4167, lon: -3.7037 };
    const g = gridStr.trim().toUpperCase();
    const lonCampos = (g.charCodeAt(0) - 65) * 20 - 180;
    const latCampos = (g.charCodeAt(1) - 65) * 10 - 90;
    const lonCuad = parseInt(g[2]) * 2;
    const latCuad = parseInt(g[3]) * 1;
    let lon = lonCampos + lonCuad + 1;
    let lat = latCampos + latCuad + 0.5;
    if (g.length >= 6) {
        const lonSub = (g.charCodeAt(4) - 65) * (2 / 24);
        const latSub = (g.charCodeAt(5) - 65) * (1 / 24);
        lon = lonCampos + lonCuad + lonSub + (1 / 24);
        lat = latCampos + latCuad + latSub + (0.5 / 24);
    }
    return { lat: parseFloat(lat.toFixed(4)), lon: parseFloat(lon.toFixed(4)) };
}
function obtenerBanda(freqStr) {
    const f = parseFloat(freqStr);
    if (isNaN(f)) return 'Desconocida';
    if (f >= 1.8 && f <= 2.0) return '160m';
    if (f >= 3.5 && f <= 3.8) return '80m';
    if (f >= 7.0 && f <= 7.3) return '40m';
    if (f >= 10.1 && f <= 10.15) return '30m';
    if (f >= 14.0 && f <= 14.35) return '20m';
    if (f >= 18.068 && f <= 18.168) return '17m';
    if (f >= 21.0 && f <= 21.45) return '15m';
    if (f >= 24.89 && f <= 24.99) return '12m';
    if (f >= 28.0 && f <= 29.7) return '10m';
    if (f >= 50.0 && f <= 52.0) return '6m';
    if (f >= 144.0 && f <= 146.0) return '2m';
    if (f >= 430.0 && f <= 440.0) return '70cm';
    return 'Otras Bandas';
}

function analizarIndicativo(callsign) {
    if (!callsign) return { pais: 'Internacional', zonaEA: 'No EA', lat: 20.0, lon: -10.0 };
    const call = callsign.trim().toUpperCase();
    let pais = 'Internacional', zonaEA = 'No EA', lat = 20.0, lon = -10.0;
    if (call.startsWith('EA') || call.startsWith('EB') || call.startsWith('EC') || call.startsWith('ED') || call.startsWith('EE') || call.startsWith('EF')) {
        pais = 'España';
        const match = call.match(/\d/);
        if (match) {
            const numero = match[0]; zonaEA = 'EA' + numero;
            const coords = { '1':[42.5,-6.0], '2':[42.8,-1.6], '3':[41.6,1.5], '4':[39.5,-4.0], '5':[39.0,-0.5], '6':[39.6,3.0], '7':[37.3,-4.5], '8':[28.4,-16.3], '9':[35.8,-5.3] };
            if (coords[numero]) { lat = coords[numero][0]; lon = coords[numero][1]; }
        } else { zonaEA = 'EA (Sin numero)'; lat = 40.4; lon = -3.7; }
    } 
    else if (call.startsWith('K') || call.startsWith('W') || call.startsWith('N') || call.startsWith('AA') || call.startsWith('AK')) { pais = 'Estados Unidos'; lat = 39.8; lon = -98.5; }
    else if (call.startsWith('F')) { pais = 'Francia'; lat = 46.2; lon = 2.2; }
    else if (call.startsWith('G') || call.startsWith('M') || call.startsWith('2E')) { pais = 'Reino Unido'; lat = 55.3; lon = -3.4; }
    else if (call.startsWith('I')) { pais = 'Italia'; lat = 41.8; lon = 12.5; }
    else if (call.startsWith('DL') || call.startsWith('DJ') || call.startsWith('DK')) { pais = 'Alemania'; lat = 51.1; lon = 10.4; }
    else if (call.startsWith('CT')) { pais = 'Portugal'; lat = 39.3; lon = -8.2; }
    else if (call.startsWith('LU') || call.startsWith('LW')) { pais = 'Argentina'; lat = -38.4; lon = -63.6; }
    else if (call.startsWith('PY') || call.startsWith('PP')) { pais = 'Brasil'; lat = -14.2; lon = -51.9; }
    else if (call.startsWith('VE') || call.startsWith('VA')) { pais = 'Canadá'; lat = 56.1; lon = -106.3; }
    else if (call.startsWith('XE')) { pais = 'México'; lat = 23.6; lon = -102.5; }
    else if (call.startsWith('CA') || call.startsWith('CE')) { pais = 'Chile'; lat = -35.6; lon = -71.5; }
    else if (call.startsWith('HJ') || call.startsWith('HK')) { pais = 'Colombia'; lat = 4.5; lon = -74.2; }
    else if (call.startsWith('YV')) { pais = 'Venezuela'; lat = 6.4; lon = -66.5; }
    else if (call.startsWith('ZP')) { pais = 'Paraguay'; lat = -23.4; lon = -58.4; }
    else if (call.startsWith('CX')) { pais = 'Uruguay'; lat = -32.5; lon = -55.7; }
    else if (call.startsWith('OA')) { pais = 'Perú'; lat = -9.1; lon = -75.0; }
    else if (call.startsWith('HC')) { pais = 'Ecuador'; lat = -1.8; lon = -78.1; }
    else if (call.startsWith('CP')) { pais = 'Bolivia'; lat = -16.2; lon = -63.5; }
    else if (call.startsWith('TI')) { pais = 'Costa Rica'; lat = 9.7; lon = -83.7; }
    else if (call.startsWith('YS')) { pais = 'El Salvador'; lat = 13.7; lon = -88.8; }
    else if (call.startsWith('TG')) { pais = 'Guatemala'; lat = 15.7; lon = -90.2; }
    else if (call.startsWith('HR')) { pais = 'Honduras'; lat = 15.1; lon = -86.2; }
    else if (call.startsWith('YN')) { pais = 'Nicaragua'; lat = 12.8; lon = -85.2; }
    else if (call.startsWith('HP')) { pais = 'Panamá'; lat = 8.5; lon = -80.7; }
    else if (call.startsWith('HI')) { pais = 'República Dominicana'; lat = 18.7; lon = -70.1; }
    else if (call.startsWith('CO') || call.startsWith('CM')) { pais = 'Cuba'; lat = 21.5; lon = -77.7; }
    else if (call.startsWith('JA') || call.startsWith('JE') || call.startsWith('JH')) { pais = 'Japón'; lat = 36.2; lon = 138.2; }
    else if (call.startsWith('VK')) { pais = 'Australia'; lat = -25.2; lon = 133.7; }
    else if (call.startsWith('ZL')) { pais = 'Nueva Zelanda'; lat = -40.9; lon = 174.8; }
    else if (call.startsWith('BY') || call.startsWith('BA')) { pais = 'China'; lat = 35.8; lon = 104.1; }
    else if (call.startsWith('HL')) { pais = 'Corea del Sur'; lat = 35.9; lon = 127.7; }
    else if (call.startsWith('VU')) { pais = 'India'; lat = 20.5; lon = 78.9; }
    else if (call.startsWith('HS')) { pais = 'Tailandia'; lat = 15.8; lon = 100.9; }
    else if (call.startsWith('9M')) { pais = 'Malasia'; lat = 4.2; lon = 101.9; }
    else if (call.startsWith('DU')) { pais = 'Filipinas'; lat = 12.8; lon = 121.7; }
    else if (call.startsWith('YB')) { pais = 'Indonesia'; lat = -0.7; lon = 113.9; }
    else if (call.startsWith('UA') || call.startsWith('RA') || call.startsWith('UW')) { pais = 'Rusia'; lat = 61.5; lon = 105.3; }
    else if (call.startsWith('UR') || call.startsWith('US')) { pais = 'Ucrania'; lat = 48.3; lon = 31.1; }
    else if (call.startsWith('SP')) { pais = 'Polonia'; lat = 51.9; lon = 19.1; }
    else if (call.startsWith('OK')) { pais = 'República Checa'; lat = 49.8; lon = 15.4; }
    else if (call.startsWith('OM')) { pais = 'Eslovaquia'; lat = 48.6; lon = 19.6; }
    else if (call.startsWith('HA')) { pais = 'Hungría'; lat = 47.1; lon = 19.5; }
    else if (call.startsWith('YO')) { pais = 'Rumanía'; lat = 45.9; lon = 24.9; }
    else if (call.startsWith('LZ')) { pais = 'Bulgaria'; lat = 42.7; lon = 25.4; }
    else if (call.startsWith('SV')) { pais = 'Grecia'; lat = 39.0; lon = 21.8; }
    else if (call.startsWith('TA')) { pais = 'Turquía'; lat = 38.9; lon = 35.2; }
    else if (call.startsWith('OD')) { pais = 'Líbano'; lat = 33.8; lon = 35.9; }
    else if (call.startsWith('4X') || call.startsWith('4Z')) { pais = 'Israel'; lat = 31.0; lon = 34.8; }
    else if (call.startsWith('JY')) { pais = 'Jordania'; lat = 30.5; lon = 36.2; }
    else if (call.startsWith('HZ')) { pais = 'Arabia Saudita'; lat = 23.8; lon = 45.0; }
    else if (call.startsWith('A6')) { pais = 'Emiratos Árabes'; lat = 23.4; lon = 53.8; }
    else if (call.startsWith('A7')) { pais = 'Catar'; lat = 25.3; lon = 51.1; }
    else if (call.startsWith('9K')) { pais = 'Kuwait'; lat = 29.3; lon = 47.4; }
    else if (call.startsWith('A9')) { pais = 'Baréin'; lat = 26.0; lon = 50.5; }
    else if (call.startsWith('A4')) { pais = 'Omán'; lat = 21.5; lon = 55.9; }
    else if (call.startsWith('YI')) { pais = 'Irak'; lat = 33.2; lon = 43.6; }
    else if (call.startsWith('EP')) { pais = 'Irán'; lat = 32.4; lon = 53.6; }
    else if (call.startsWith('EX')) { pais = 'Kirguistán'; lat = 41.2; lon = 74.7; }
    else if (call.startsWith('EY')) { pais = 'Tayikistán'; lat = 38.8; lon = 71.2; }
    else if (call.startsWith('EZ')) { pais = 'Turkmenistán'; lat = 38.9; lon = 59.5; }
    else if (call.startsWith('UK')) { pais = 'Uzbekistán'; lat = 41.3; lon = 64.5; }
    else if (call.startsWith('UN')) { pais = 'Kazajistán'; lat = 48.0; lon = 66.9; }
    else if (call.startsWith('4L')) { pais = 'Georgia'; lat = 42.3; lon = 43.3; }
    else if (call.startsWith('EK')) { pais = 'Armenia'; lat = 40.0; lon = 45.0; }
    else if (call.startsWith('4J') || call.startsWith('4K')) { pais = 'Azerbaiyán'; lat = 40.1; lon = 47.5; }
    else if (call.startsWith('PA') || call.startsWith('PI')) { pais = 'Países Bajos'; lat = 52.1; lon = 5.2; }
    else if (call.startsWith('ON') || call.startsWith('OR')) { pais = 'Bélgica'; lat = 50.5; lon = 4.4; }
    else if (call.startsWith('HB')) { pais = 'Suiza'; lat = 46.8; lon = 8.2; }
    else if (call.startsWith('OE')) { pais = 'Austria'; lat = 47.5; lon = 14.5; }
    else if (call.startsWith('SM') || call.startsWith('7S')) { pais = 'Suecia'; lat = 60.1; lon = 18.6; }
    else if (call.startsWith('LA') || call.startsWith('LN')) { pais = 'Noruega'; lat = 60.4; lon = 8.1; }
    else if (call.startsWith('OZ')) { pais = 'Dinamarca'; lat = 56.2; lon = 9.5; }
    else if (call.startsWith('OH')) { pais = 'Finlandia'; lat = 61.9; lon = 25.7; }
    else if (call.startsWith('EI')) { pais = 'Irlanda'; lat = 53.4; lon = -8.2; }
    else if (call.startsWith('LX')) { pais = 'Luxemburgo'; lat = 49.8; lon = 6.1; }
    else if (call.startsWith('SU')) { pais = 'Egipto'; lat = 26.8; lon = 30.8; }
    else if (call.startsWith('3V')) { pais = 'Túnez'; lat = 33.8; lon = 9.5; }
    else if (call.startsWith('7X')) { pais = 'Argelia'; lat = 28.0; lon = 1.6; }
    else if (call.startsWith('CN')) { pais = 'Marruecos'; lat = 31.7; lon = -7.0; }
    else if (call.startsWith('5T')) { pais = 'Mauritania'; lat = 21.0; lon = -10.9; }
    else if (call.startsWith('3X')) { pais = 'Guinea'; lat = 9.9; lon = -12.2; }
    else if (call.startsWith('6W')) { pais = 'Senegal'; lat = 14.4; lon = -14.4; }
    else if (call.startsWith('TU')) { pais = 'Costa de Marfil'; lat = 7.5; lon = -5.5; }
    else if (call.startsWith('9G')) { pais = 'Ghana'; lat = 7.9; lon = -1.0; }
    else if (call.startsWith('5N')) { pais = 'Nigeria'; lat = 9.0; lon = 8.6; }
    else if (call.startsWith('9Q')) { pais = 'R. D. del Congo'; lat = -4.0; lon = 21.7; }
    else if (call.startsWith('5Z')) { pais = 'Kenia'; lat = -0.02; lon = 37.9; }
    else if (call.startsWith('9J')) { pais = 'Zambia'; lat = -13.1; lon = 27.8; }
    else if (call.startsWith('7Q')) { pais = 'Malaui'; lat = -13.2; lon = 34.3; }
    else if (call.startsWith('Z2')) { pais = 'Zimbabue'; lat = -19.0; lon = 29.1; }
    else if (call.startsWith('V5')) { pais = 'Namibia'; lat = -22.9; lon = 18.4; }
    else if (call.startsWith('A2')) { pais = 'Botsuana'; lat = -22.3; lon = 24.6; }
    else if (call.startsWith('ZS')) { pais = 'Sudáfrica'; lat = -30.5; lon = 22.9; }
    return { pais, zonaEA, lat, lon };
}
app.get('/api/contactos', (req, res) => {
    db.all(`SELECT * FROM contactos ORDER BY id DESC`, (err, rows) => {
        if (err || !rows) return res.json({ actividad: null, lista: [] });
        db.get(`SELECT * FROM actividad_actual WHERE id = 1`, (errAct, actividad) => {
            const infoAct = actividad || { mi_indicativo: 'EA4/', tipo: 'POTA', referencia: '-', mi_grid: 'IN80', mi_lat: 40.4167, mi_lon: -3.7037 };
            const listaProcesada = rows.map(qso => {
                const infoRadio = analizarIndicativo(qso.indicativo);
                return {
                    id: qso.id,
                    indicativo: qso.indicativo ? qso.indicativo.toUpperCase() : 'DESCONOCIDO',
                    frecuencia: qso.frecuencia || '14.000',
                    modo: qso.modo || 'SSB',
                    nombre: qso.nombre || '59',
                    qth: qso.qth || '-',
                    fecha: qso.fecha || '',
                    banda: obtenerBanda(qso.frecuencia),
                    pais: infoRadio.pais, zonaEA: infoRadio.zonaEA, lat: infoRadio.lat, lon: infoRadio.lon
                };
            });
            res.json({ actividad: infoAct, lista: listaProcesada });
        });
    });
});

app.post('/api/actividad', (req, res) => {
    const { mi_indicativo, tipo, referencia, mi_grid } = req.body;
    db.get(`SELECT referencia, tipo, mi_indicativo, mi_grid FROM actividad_actual WHERE id = 1`, (errCheck, rowAct) => {
        let referenciaDefinitiva = referencia;
        let tipoDefinitivo = tipo || 'POTA';
        
        if (rowAct && rowAct.referencia && rowAct.referencia !== '-') {
            if (!referencia || referencia === '-' || referencia.toUpperCase().includes('FINALIZADA')) {
                referenciaDefinitiva = rowAct.referencia;
            }
        }
        
        if (tipoDefinitivo.includes('_FINALIZADA')) {
            tipoDefinitivo = tipoDefinitivo.replace(/(_FINALIZADA)+/g, '_FINALIZADA');
        }
        
        const gridLimpio = (mi_grid || (rowAct ? rowAct.mi_grid : 'IN80')).trim().toUpperCase();
        const coords = gridACoordenadas(gridLimpio);
        const indDefinitivo = mi_indicativo ? mi_indicativo.toUpperCase() : (rowAct ? rowAct.mi_indicativo : 'EA');
        
        db.run(`INSERT OR REPLACE INTO actividad_actual (id, mi_indicativo, tipo, referencia, mi_grid, mi_lat, mi_lon) VALUES (1, ?, ?, ?, ?, ?, ?)`,
            [indDefinitivo, tipoDefinitivo, referenciaDefinitiva.toUpperCase(), gridLimpio, coords.lat, coords.lon],
            function(err) { res.json({ success: !err, error: err ? err.message : null }); }
        );
    });
});
app.post('/api/publicar-anuncio', (req, res) => {
    const { mensaje } = req.body;
    if (!mensaje) return res.json({ success: false, error: "Mensaje vacío" });
    
    const fecha = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    const marcaUnica = `||📢_ANUNCIO_OFICIAL_POTA_||_${Date.now()}`;
    
    db.run(`INSERT INTO contactos (indicativo, frecuencia, modo, nombre, qth, fecha) VALUES (?, '', 'INFO', ?, '', ?)`,
        [marcaUnica, mensaje, fecha],
        function(err) { res.json({ success: !err, error: err ? err.message : null }); }
    );
});

app.post('/api/contactos', (req, res) => {
    const { indicativo, frecuencia, modo, nombre, qth } = req.body;
    if (!indicativo || !frecuencia) return res.json({ success: false, error: "Datos incompletos" });
    const callLimpio = indicativo.trim().toUpperCase();

    db.get(`SELECT id FROM contactos WHERE UPPER(indicativo) = ?`, [callLimpio], (errDup, rowDup) => {
        if (errDup) return res.json({ success: false, error: errDup.message });
        if (rowDup) {
            return res.json({ success: false, duplicado: true, error: `El indicativo ${callLimpio} ya está registrado en esta actividad.` });
        }
        const fecha = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
        db.run(`INSERT INTO contactos (indicativo, frecuencia, modo, nombre, qth, fecha) VALUES (?, ?, ?, ?, ?, ?)`,
            [callLimpio, frecuencia, modo || 'SSB', nombre || '59', qth || '', fecha],
            function(err) { res.json({ success: !err, error: err ? err.message : null }); }
        );
    });
});

app.delete('/api/contactos/:id', (req, res) => {
    db.run(`DELETE FROM contactos WHERE id = ?`, [req.params.id], err => { 
        res.json({ success: !err, error: err ? err.message : null }); 
    });
});
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, DATA_DIR),
    filename: (req, file, cb) => cb(null, 'qsl_fondo.jpg')
});
const upload = multer({ storage });
app.post('/api/upload-bg', upload.single('fondo'), (req, res) => res.json({ success: true }));

app.get('/api/qrz/:indicativo', (req, res) => {
    const indicativo = req.params.indicativo.trim().toUpperCase();
    db.get(`SELECT * FROM qrz_mundial WHERE indicativo = ?`, [indicativo], (err, row) => {
        if (!err && row) return res.json({ nombre: row.nombre, qth: row.qth });
        return res.json({ nombre: '59', qth: (indicativo.startsWith('EA') || indicativo.startsWith('EB')) ? 'España' : 'Internacional' });
    });
});

app.get('/api/exportar-adif', (req, res) => {
    db.all(`SELECT * FROM contactos ORDER BY id ASC`, (err, rows) => {
        if (err) return res.status(500).send(err.message);
        const filtrados = rows.filter(q => !q.indicativo.startsWith("||📢_ANUNCIO_OFICIAL_POTA_||") && !q.indicativo.startsWith("||_ANUNCIO_OFICIAL_POTA_||"));
        let adif = `POTA Logbook Export\nCreated: ${new Date().toISOString()}\n<EOH>\n\n`;
        filtrados.forEach(qso => {
            const freq = qso.frecuencia || '14.000', modo = qso.modo || 'SSB';
            const partes = qso.fecha ? qso.fecha.split(' ') : [];
            const fParte = partes[0] ? partes[0].replace(/-/g, '') : '20260101';
            const hParte = partes[1] ? partes[1].replace(/:/g, '') : '120000';
            adif += `<CALL:${qso.indicativo.length}>${qso.indicativo} <FREQ:${freq.length}>${freq} <MODE:${modo.length}>${modo} <QSO_DATE:${fParte.length}>${fParte} <TIME_ON:${hParte.length}>${hParte} <EOR>\n`;
        });
        res.attachment('log_pota.adi'); res.type('text/plain'); res.send(adif);
    });
});
app.get('/api/exportar-csv', (req, res) => {
    db.all(`SELECT * FROM contactos ORDER BY id ASC`, (err, rows) => {
        if (err) return res.status(500).send("Fallo al consultar la base de datos");
        const filtrados = rows.filter(q => !q.indicativo.startsWith("||📢_ANUNCIO_OFICIAL_POTA_||") && !q.indicativo.startsWith("||_ANUNCIO_OFICIAL_POTA_||"));
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=historial_qso.csv');
        let csv = '\uFEFFIndicativo,Frecuencia,Modo,RST,Fecha UTC\n'; 
        filtrados.forEach(q => {
            csv += `${q.indicativo || ''},${q.frecuencia ? q.frecuencia.replace(' MHz', '') : ''},${q.modo || 'SSB'},${q.nombre || '59'},${q.fecha || ''}\n`;
        });
        res.send(csv);
    });
});

app.get('/api/exportar-pdf', (req, res) => {
    db.all(`SELECT * FROM contactos ORDER BY id ASC`, (err, rows) => {
        if (err) return res.status(500).send("Error");
        
        const filtrados = rows.filter(q => !q.indicativo.startsWith("||📢_ANUNCIO_OFICIAL_POTA_||") && !q.indicativo.startsWith("||_ANUNCIO_OFICIAL_POTA_||"));
        
        db.get(`SELECT * FROM actividad_actual WHERE id = 1`, (errAct, act) => {
            let tipoLimpio = act ? act.tipo : 'POTA';
            if (tipoLimpio) tipoLimpio = tipoLimpio.replace('_FINALIZADA', '');
            
            const infoAct = act || { mi_indicativo: 'EA', tipo: 'POTA', referencia: '-', mi_grid: 'IN80' };
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename=resumen_actividad.pdf');
            
            const doc = new PDFDocument({ margin: 35, size: 'A4' });
            doc.pipe(res);

            doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(24).text('Operación Finalizada', 35, 40);
            doc.fillColor('#475569').font('Helvetica').fontSize(11).text(`Actividad ${tipoLimpio} - Ref: ${infoAct.referencia}`, 35, 70);
            doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(13).text('ESTADISTICAS GENERALES', 35, 110);
            doc.rect(35, 126, 507, 1).fill('#cbd5e1');
            let cModos = {}, cBandas = {}, cPaises = {}, cZonas = {}, tModos = 0, tPaises = 0, pVistos = {};
            filtrados.forEach(q => {
                if (!cModos[q.modo]) { cModos[q.modo] = 0; tModos++; } cModos[q.modo]++;
                const b = obtenerBanda(q.frecuencia); cBandas[b] = (cBandas[b] || 0) + 1;
                const inf = analizarIndicativo(q.indicativo);
                if (!pVistos[inf.pais]) { pVistos[inf.pais] = true; tPaises++; } cPaises[inf.pais] = (cPaises[inf.pais] || 0) + 1;
                if (inf.zonaEA !== 'No EA') cZonas[inf.zonaEA] = (cZonas[inf.zonaEA] || 0) + 1;
            });

            let horaInicio = '--:--';
            let horaFin = '--:--';
            if (filtrados.length > 0) {
                const primerQso = filtrados[0]; 
                const ultimoQso = filtrados[filtrados.length - 1]; 
                if (primerQso && primerQso.fecha) {
                    const mI = primerQso.fecha.match(/(\d{2}):(\d{2})/);
                    if (mI) horaInicio = mI[1] + ':' + mI[2];
                }
                if (ultimoQso && ultimoQso.fecha) {
                    const mF = ultimoQso.fecha.match(/(\d{2}):(\d{2})/);
                    if (mF) horaFin = mF[1] + ':' + mF[2];
                }
            }
            const ventanaTexto = `${horaInicio} a ${horaFin}`;
            
            const yCard = 140, aC = 111, sp = 21;
            doc.rect(35, yCard, aC, 60).fillAndStroke('#f8fafc', '#e2e8f0');
            doc.fillColor('#10b981').font('Helvetica-Bold').fontSize(20).text(`${filtrados.length}`, 35, yCard + 12, {width: aC, align: 'center'});
            doc.fillColor('#64748b').fontSize(8).text('TOTAL QSOs', 35, yCard + 40, {width: aC, align: 'center'});
            
            doc.rect(35 + (aC + sp), yCard, aC, 60).fillAndStroke('#f8fafc', '#e2e8f0');
            doc.fillColor('#3b82f6').font('Helvetica-Bold').fontSize(20).text(`${tModos}`, 35 + (aC + sp), yCard + 12, {width: aC, align: 'center'});
            doc.fillColor('#64748b').fontSize(8).text('MODOS', 35 + (aC + sp), yCard + 40, {width: aC, align: 'center'});
            
            doc.rect(35 + (aC + sp) * 2, yCard, aC, 60).fillAndStroke('#f8fafc', '#e2e8f0');
            doc.fillColor('#3b82f6').font('Helvetica-Bold').fontSize(20).text(`${tPaises}`, 35 + (aC + sp) * 2, yCard + 12, {width: aC, align: 'center'});
            doc.fillColor('#64748b').fontSize(8).text('PAISES', 35 + (aC + sp) * 2, yCard + 40, {width: aC, align: 'center'});
            
            doc.rect(35 + (aC + sp) * 3, yCard, aC, 60).fillAndStroke('#f8fafc', '#e2e8f0');
            doc.fillColor('#2563eb').font('Helvetica-Bold').fontSize(11).text(ventanaTexto, 35 + (aC + sp) * 3, yCard + 16, {width: aC, align: 'center'});
            doc.fillColor('#64748b').fontSize(8).text('VENTANA UTC', 35 + (aC + sp) * 3, yCard + 40, {width: aC, align: 'center'});
            function pDet(tit, obj, x, y, w) {
                doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(12).text(tit, x, y);
                doc.rect(x, y + 14, w, 1).fill('#cbd5e1');
                let arr = []; for (let k in obj) arr.push({ n: k, c: obj[k] }); arr.sort((a,b)=>b.c-a.c);
                let yS = y + 22; doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(8).text('QSOs', x + w - 30, yS, {width: 30, align: 'right'});
                yS += 12; arr.slice(0, 5).forEach(it => { doc.fillColor('#334155').font('Helvetica').fontSize(9).text(it.n, x).fillColor('#2563eb').font('Helvetica-Bold').text(`${it.c}`, x + w - 30, yS, {width: 30, align: 'right'}); yS += 15; });
            }
            pDet('USO DE BANDAS', cBandas, 35, 225, 240); pDet('USO DE MODOS', cModos, 302, 225, 240);
            pDet('DISTRITOS EA', cZonas, 35, 355, 240); pDet('PAISES DX', cPaises, 302, 355, 240);

            doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(13).text('HISTORIAL COMPLETO DE QSOs', 35, 485).rect(35, 501, 507, 1).fill('#cbd5e1');
            let yT = 515; doc.rect(35, yT, 507, 18).fill('#f1f5f9'); doc.fillColor('#475569').font('Helvetica-Bold').fontSize(8).text('INDICATIVO', 45, yT + 5).text('FREQ', 135, yT + 5).text('MODO', 235, yT + 5).text('RST', 325, yT + 5).text('FECHA UTC', 395, yT + 5);
            yT += 18;
            filtrados.forEach((q, idx) => {
                if (yT > 760) { doc.addPage(); yT = 40; doc.rect(35, yT, 507, 18).fill('#f1f5f9'); doc.fillColor('#475569').font('Helvetica-Bold').fontSize(8).text('INDICATIVO', 45, yT + 5).text('FREQ', 135, yT + 5).text('MODO', 235, yT + 5).text('RST', 325, yT + 5).text('FECHA UTC', 395, yT + 5); yT += 18; }
                if(idx % 2 === 0) doc.rect(35, yT, 507, 16).fill('#f8fafc');
                doc.fillColor('#1d4ed8').font('Helvetica-Bold').fontSize(9).text(q.indicativo || '-', 45, yT + 4);
                doc.fillColor('#334155').font('Helvetica').fontSize(9).text(q.frecuencia || '-', 135, yT + 4).text(q.modo || 'SSB', 235, yT + 4).fillColor('#059669').font('Helvetica-Bold').text(q.nombre || '59', 325, yT + 4).fillColor('#64748b').font('Helvetica').fontSize(8.5).text(q.fecha || '-', 395, yT + 4);
                doc.rect(35, yT + 16, 507, 0.5).fill('#e2e8f0'); yT += 16;
            });
            doc.end();
        });
    });
});
app.get('/api/qsl/:indicativo', (req, res) => {
    const indicativo = req.params.indicativo.toUpperCase();
    db.get('SELECT * FROM contactos WHERE indicativo = ?', [indicativo], (err, contacto) => {
        if (err || !contacto) return res.status(404).send("No encontrado");
        db.get('SELECT * FROM actividad_actual WHERE id = 1', (errAct, act) => {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=QSL_${indicativo}.pdf`);
            
            const aQ = 396.85, hQ = 255.11;
            const doc = new PDFDocument({ margin: 0, size: [aQ, hQ] });
            doc.pipe(res);
            
            if (fs.existsSync(BG_PATH)) { 
                doc.image(BG_PATH, 0, 0, { width: aQ, height: hQ }); 
            } else { 
                doc.rect(0, 0, aQ, hQ).fill('#1e293b'); 
                doc.fillColor('#94a3b8').font('Helvetica-Bold').fontSize(14).text('POTA LOGBOOK', 0, 100, { width: aQ, align: 'center' }); 
            }

            const hF = 40; const yF = hQ - hF; const aCol = aQ / 6; 
            doc.rect(0, yF, aQ, hF).fill('#ffffff').rect(0, yF, aQ, 1).fill('#cbd5e1');
            
            let fT = '-', hT = '-'; 
            if (contacto.fecha) { const p = contacto.fecha.split(' '); fT = p[0] || '-'; hT = p[1] || '-'; }
            
            doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(7.5);
            doc.text('INDICATIVO', 0, yF + 8, { width: aCol, align: 'center' }).font('Helvetica-Bold').fontSize(9).fillColor('#2563eb').text(contacto.indicativo || '-', 0, yF + 22, { width: aCol, align: 'center' });
            doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(7.5).text('FECHA', aCol, yF + 8, { width: aCol, align: 'center' }).font('Helvetica').fontSize(8.5).text(fT, aCol, yF + 22, { width: aCol, align: 'center' });
            doc.font('Helvetica-Bold').fontSize(7.5).text('HORA UTC', aCol * 2, yF + 8, { width: aCol, align: 'center' }).font('Helvetica').fontSize(8.5).text(hT, aCol * 2, yF + 22, { width: aCol, align: 'center' });
            doc.font('Helvetica-Bold').fontSize(7.5).text('FREQ', aCol * 3, yF + 8, { width: aCol, align: 'center' }).font('Helvetica').fontSize(8.5).text(contacto.frecuencia || '-', aCol * 3, yF + 22, { width: aCol, align: 'center' });
            doc.font('Helvetica-Bold').fontSize(7.5).text('MODO', aCol * 4, yF + 8, { width: aCol, align: 'center' }).font('Helvetica').fontSize(8.5).text(contacto.modo || 'SSB', aCol * 4, yF + 22, { width: aCol, align: 'center' });
            doc.font('Helvetica-Bold').fontSize(7.5).text('RST', aCol * 5, yF + 8, { width: aCol, align: 'center' }).font('Helvetica-Bold').fontSize(9).fillColor('#10b981').text(contacto.nombre || '59', aCol * 5, yF + 22, { width: aCol, align: 'center' });
            
            doc.end();
        });
    });
});

app.get('/admin/resumen.html', (req, res) => { res.setHeader('Content-Type', 'text/html'); res.sendFile(path.join(path.resolve(__dirname, 'public_admin'), 'resumen.html')); });
app.get('/admin/leaflet.css', (req, res) => { res.setHeader('Content-Type', 'text/css'); res.send(`.leaflet-pane{position:absolute}`); });

app.use('/admin', express.static(path.resolve(__dirname, 'public_admin')));
app.use('/', express.static(path.resolve(__dirname, 'public_user')));

app.listen(3000, '0.0.0.0', () => console.log("Servidor POTA listo en el puerto 3000"));
