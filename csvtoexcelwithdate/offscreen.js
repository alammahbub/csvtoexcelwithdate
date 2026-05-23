// ---- IndexedDB helper (shared origin with service worker) ----
function openDB() {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open('csv2xlsx', 1);
		req.onupgradeneeded = () => req.result.createObjectStore('data');
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function readFromIDB(key) {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction('data', 'readonly');
		const req = tx.objectStore('data').get(key);
		req.onsuccess = () => { db.close(); resolve(req.result); };
		req.onerror = () => { db.close(); reject(req.error); };
	});
}

async function deleteFromIDB(key) {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction('data', 'readwrite');
		tx.objectStore('data').delete(key);
		tx.oncomplete = () => { db.close(); resolve(); };
		tx.onerror = () => { db.close(); reject(tx.error); };
	});
}

// ---- Keepalive port ----
chrome.runtime.onConnect.addListener((port) => {
	if (port.name === 'csv2xlsx-keepalive') {
		port.onDisconnect.addListener(() => {});
	}
});

// ---- Message handler ----
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.target !== 'offscreen') return;

	if (message.type === 'convert-csv-from-url') {
		const { url, filename } = message.data;
		fetch(url)
			.then(resp => resp.text())
			.then(csvData => convertAndSend(csvData, filename))
			.catch(e => sendError('Fetch failed: ' + e.message));
	}

	if (message.type === 'convert-csv-from-idb') {
		const { idbKey, filename } = message.data;
		readFromIDB(idbKey)
			.then(csvData => {
				if (!csvData) throw new Error('No data found in storage');
				return convertAndSend(csvData, filename);
			})
			.then(() => deleteFromIDB(idbKey))
			.catch(e => {
				deleteFromIDB(idbKey).catch(() => {});
				sendError('IDB read/convert failed: ' + e.message);
			});
	}
});

// ---- High-Performance XML & ZIP Writer ----
function crc32(strOrUint8) {
	const table = new Int32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let j = 0; j < 8; j++) {
			c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
		}
		table[i] = c;
	}
	let crc = 0 ^ (-1);
	const data = (typeof strOrUint8 === 'string') ? new TextEncoder().encode(strOrUint8) : strOrUint8;
	for (let i = 0; i < data.length; i++) {
		crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
	}
	return (crc ^ (-1)) >>> 0;
}

class SimpleZip {
	constructor() {
		this.files = [];
	}
	addFile(filename, content) {
		const data = (typeof content === 'string') ? new TextEncoder().encode(content) : content;
		this.files.push({ filename, data });
	}
	generateBlob() {
		const parts = [];
		const fileOffsets = [];
		let currentOffset = 0;

		for (const file of this.files) {
			const fnBytes = new TextEncoder().encode(file.filename);
			const header = new ArrayBuffer(30);
			const view = new DataView(header);
			const crc = crc32(file.data);

			view.setUint32(0, 0x04034b50, true);
			view.setUint16(4, 10, true);
			view.setUint16(6, 0, true);
			view.setUint16(8, 0, true); // 0 = store (uncompressed)
			view.setUint16(10, 0, true);    // mod time: 00:00:00
			view.setUint16(12, 0x21, true); // mod date: 1980-01-01
			view.setUint32(14, crc, true);
			view.setUint32(18, file.data.length, true);
			view.setUint32(22, file.data.length, true);
			view.setUint16(26, fnBytes.length, true);
			view.setUint16(28, 0, true);

			fileOffsets.push(currentOffset);
			parts.push(new Uint8Array(header));
			parts.push(fnBytes);
			parts.push(file.data);

			currentOffset += 30 + fnBytes.length + file.data.length;
		}

		const centralDirStart = currentOffset;
		let centralDirSize = 0;

		for (let i = 0; i < this.files.length; i++) {
			const file = this.files[i];
			const fnBytes = new TextEncoder().encode(file.filename);
			const header = new ArrayBuffer(46);
			const view = new DataView(header);
			const crc = crc32(file.data);

			view.setUint32(0, 0x02014b50, true);
			view.setUint16(4, 20, true);
			view.setUint16(6, 10, true);
			view.setUint16(8, 0, true);
			view.setUint16(10, 0, true);
			view.setUint16(12, 0, true);     // mod time: 00:00:00
			view.setUint16(14, 0x21, true);  // mod date: 1980-01-01
			view.setUint32(16, crc, true);
			view.setUint32(20, file.data.length, true);
			view.setUint32(24, file.data.length, true);
			view.setUint16(28, fnBytes.length, true);
			view.setUint16(30, 0, true);
			view.setUint16(32, 0, true);
			view.setUint16(34, 0, true);
			view.setUint16(36, 0, true);
			view.setUint32(38, 0, true);
			view.setUint32(42, fileOffsets[i], true);

			parts.push(new Uint8Array(header));
			parts.push(fnBytes);

			centralDirSize += 46 + fnBytes.length;
			currentOffset += 46 + fnBytes.length;
		}

		const eocd = new ArrayBuffer(22);
		const view = new DataView(eocd);

		view.setUint32(0, 0x06054b50, true);
		view.setUint16(4, 0, true);
		view.setUint16(6, 0, true);
		view.setUint16(8, this.files.length, true);
		view.setUint16(10, this.files.length, true);
		view.setUint32(12, centralDirSize, true);
		view.setUint32(16, centralDirStart, true);
		view.setUint16(20, 0, true);

		parts.push(new Uint8Array(eocd));

		return new Blob(parts, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
	}
}

function escapeXML(str) {
	if (typeof str !== 'string') return '';
	const clean = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
	return clean.replace(/&/g, '&amp;')
	            .replace(/</g, '&lt;')
	            .replace(/>/g, '&gt;')
	            .replace(/"/g, '&quot;')
	            .replace(/'/g, '&apos;');
}

function getCellAddress(col, row) {
	let colName = '';
	let temp = col;
	while (temp >= 0) {
		colName = String.fromCharCode((temp % 26) + 65) + colName;
		temp = Math.floor(temp / 26) - 1;
	}
	return colName + (row + 1);
}

function parseCSV(text) {
	const rows = [];
	let row = [];
	let cell = '';
	let inQuotes = false;

	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		const nextChar = text[i + 1];

		if (inQuotes) {
			if (char === '"') {
				if (nextChar === '"') {
					cell += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				cell += char;
			}
		} else {
			if (char === '"') {
				inQuotes = true;
			} else if (char === ',') {
				row.push(cell);
				cell = '';
			} else if (char === '\n' || char === '\r') {
				row.push(cell);
				rows.push(row);
				row = [];
				cell = '';
				if (char === '\r' && nextChar === '\n') {
					i++;
				}
			} else {
				cell += char;
			}
		}
	}

	if (cell || row.length > 0) {
		row.push(cell);
		rows.push(row);
	}

	return rows;
}

function convertAndSend(csvData, filename) {
	try {
		const rows = parseCSV(csvData);
		
		// Calculate sheet dimension to prevent corruption warning
		let maxCols = 0;
		for (const row of rows) {
			if (row.length > maxCols) maxCols = row.length;
		}
		if (maxCols === 0) maxCols = 1;
		const endAddress = getCellAddress(maxCols - 1, rows.length - 1);
		const dimensionRef = rows.length > 0 ? `A1:${endAddress}` : 'A1:A1';

		// 1. Generate sheet1.xml
		let sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
		sheetXml += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">\n';
		sheetXml += `  <dimension ref="${dimensionRef}"/>\n`;
		sheetXml += '  <sheetData>\n';

		for (let r = 0; r < rows.length; r++) {
			const rowData = rows[r];
			// Ignore completely empty rows
			if (rowData.length === 0 || (rowData.length === 1 && rowData[0] === '')) continue;
			
			sheetXml += `    <row r="${r + 1}">\n`;
			for (let c = 0; c < rowData.length; c++) {
				const cellValue = rowData[c];
				if (cellValue === '' || cellValue === undefined || cellValue === null) continue;

				const address = getCellAddress(c, r);
				const trimmed = cellValue.trim();
				
				// Check if cellValue is a valid number
				const isNum = !isNaN(trimmed) && trimmed !== '';
				if (isNum) {
					sheetXml += `      <c r="${address}"><v>${trimmed}</v></c>\n`;
				} else {
					sheetXml += `      <c r="${address}" t="inlineStr"><is><t>${escapeXML(cellValue)}</t></is></c>\n`;
				}
			}
			sheetXml += '    </row>\n';
		}

		sheetXml += '  </sheetData>\n';
		sheetXml += '</worksheet>';

		// 2. Generate other metadata files
		const contentTypesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
			'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
			'  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
			'  <Default Extension="xml" ContentType="application/xml"/>\n' +
			'  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>\n' +
			'  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>\n' +
			'  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>\n' +
			'</Types>';

		const relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
			'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
			'  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>\n' +
			'</Relationships>';

		const workbookRelsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
			'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
			'  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>\n' +
			'  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>\n' +
			'</Relationships>';

		const workbookXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
			'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n' +
			'  <sheets>\n' +
			'    <sheet name="Sheet1" sheetId="1" r:id="rId1"/>\n' +
			'  </sheets>\n' +
			'</workbook>';

		const stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
			'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">\n' +
			'  <fonts count="1">\n' +
			'    <font><sz val="11"/><name val="Calibri"/><family val="2"/></font>\n' +
			'  </fonts>\n' +
			'  <fills count="2">\n' +
			'    <fill><patternFill patternType="none"/></fill>\n' +
			'    <fill><patternFill patternType="gray125"/></fill>\n' +
			'  </fills>\n' +
			'  <borders count="1">\n' +
			'    <border><left/><right/><top/><bottom/></border>\n' +
			'  </borders>\n' +
			'  <cellStyleXfs count="1">\n' +
			'    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>\n' +
			'  </cellStyleXfs>\n' +
			'  <cellXfs count="1">\n' +
			'    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>\n' +
			'  </cellXfs>\n' +
			'</styleSheet>';

		// 3. Zip files
		const zip = new SimpleZip();
		zip.addFile('[Content_Types].xml', contentTypesXml);
		zip.addFile('_rels/.rels', relsXml);
		zip.addFile('xl/_rels/workbook.xml.rels', workbookRelsXml);
		zip.addFile('xl/workbook.xml', workbookXml);
		zip.addFile('xl/styles.xml', stylesXml);
		zip.addFile('xl/worksheets/sheet1.xml', sheetXml);

		const blob = zip.generateBlob();
		const blobUrl = URL.createObjectURL(blob);

		chrome.runtime.sendMessage({
			target: 'background',
			type: 'xlsx-ready',
			data: { blobUrl, filename }
		});
	} catch (e) {
		sendError('Conversion failed: ' + e.message);
	}
}

function sendError(errorMsg) {
	chrome.runtime.sendMessage({
		target: 'background',
		type: 'convert-error',
		error: errorMsg
	});
}
