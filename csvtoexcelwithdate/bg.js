function appendTimestamp() {	
	var now = new Date();
	
	year = now.getFullYear();
	month = now.getMonth() + 1;
	month = (month <10?'0':'') + month;
	day = (now.getDate() <10?'0':'') + now.getDate();
	hour = (now.getHours() <10?'0':'') + now.getHours();
	minutes = (now.getMinutes() <10?'0':'') + now.getMinutes();
	seconds = (now.getSeconds() <10?'0':'') + now.getSeconds();
  
	/*//Current format */
	var myDate = year.toString() + "-" + month.toString() + "-" + day.toString();
	var myTime = hour.toString() + "." + minutes.toString() + "." + seconds.toString();
  
	/*//Original format */
	//var myDate = year.toString() + month.toString() + day.toString();
	//var myTime = hour.toString() + minutes.toString() + seconds.toString();
	//var timestamp = myDate + "T" + myTime;
	
	/*//Current released format */
	//var myDate = day.toString() + "-" + month.toString() + "-" + year.toString();
	//var myTime = hour.toString() + "." + minutes.toString() + "." + seconds.toString();
	//var timestamp = myDate + "_" + myTime;
	
	var timestamp = myDate + "_" + myTime;
	return timestamp;
}

// Track downloads we initiated so we don't re-intercept them
const ourDownloads = new Set();

// Track active tab for loading overlay
let activeTabId = null;

// Track active chunk transfers
const activeTransfers = {};

// Track blob URLs we created and their desired filenames
const blobFilenameMap = {};

// ---- IndexedDB helper (shared origin with offscreen document) ----
function openDB() {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open('csv2xlsx', 1);
		req.onupgradeneeded = () => req.result.createObjectStore('data');
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function writeToIDB(key, value) {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction('data', 'readwrite');
		tx.objectStore('data').put(value, key);
		tx.oncomplete = () => { db.close(); resolve(); };
		tx.onerror = () => { db.close(); reject(tx.error); };
	});
}

// Keep service worker alive during conversion
let keepAlivePort = null;

function startKeepAlive() {
	if (keepAlivePort) return;
	keepAlivePort = chrome.runtime.connect({ name: 'csv2xlsx-keepalive' });
	keepAlivePort.onDisconnect.addListener(() => {
		keepAlivePort = null;
	});
}

function stopKeepAlive() {
	if (keepAlivePort) {
		keepAlivePort.disconnect();
		keepAlivePort = null;
	}
}

// Ensure offscreen document exists
let creatingOffscreen;
async function ensureOffscreen() {
	if (typeof chrome !== 'undefined' && chrome['offscreen'] && chrome['offscreen']['createDocument']) {
		// Chrome/Edge: Use standard offscreen document API
		const contexts = await chrome.runtime.getContexts({
			contextTypes: ['OFFSCREEN_DOCUMENT'],
			documentUrls: [chrome.runtime.getURL('offscreen.html')]
		});
		if (contexts.length > 0) return;

		if (creatingOffscreen) {
			await creatingOffscreen;
		} else {
			creatingOffscreen = chrome['offscreen']['createDocument']({
				url: 'offscreen.html',
				reasons: ['BLOBS'],
				justification: 'Convert CSV data to XLSX using SheetJS'
			});
			await creatingOffscreen;
			creatingOffscreen = null;
		}
	} else {
		// Firefox: Fallback to creating a hidden iframe in the background page
		if (document.getElementById('csv2xlsx-firefox-offscreen')) return;
		
		const iframe = document.createElement('iframe');
		iframe.id = 'csv2xlsx-firefox-offscreen';
		iframe.src = chrome.runtime.getURL('offscreen.html');
		iframe.style.display = 'none';
		document.body.appendChild(iframe);
	}
}

// Show loading overlay on the active tab
async function showLoading(tabId, filename) {
	try {
		await chrome.scripting.executeScript({
			target: { tabId },
			func: (fname) => {
				const existing = document.getElementById('csv2xlsx-overlay');
				if (existing) existing.remove();

				const overlay = document.createElement('div');
				overlay.id = 'csv2xlsx-overlay';
				overlay.innerHTML = `
					<div style="
						position:fixed; top:0; left:0; right:0; bottom:0;
						background:rgba(0,0,0,0.5); z-index:2147483647;
						display:flex; align-items:center; justify-content:center;
						font-family:'Segoe UI',Arial,sans-serif;
					">
						<div style="
							background:#1e1e2e; border-radius:16px; padding:32px 48px;
							box-shadow:0 8px 32px rgba(0,0,0,0.4); text-align:center;
							border:1px solid rgba(255,255,255,0.1);
						">
							<div style="
								width:48px; height:48px; margin:0 auto 16px;
								border:4px solid rgba(255,255,255,0.1);
								border-top:4px solid #4ade80;
								border-radius:50%;
								animation:csv2xlsx-spin 0.8s linear infinite;
							"></div>
							<div style="color:#fff; font-size:16px; font-weight:600; margin-bottom:8px;">
								Converting CSV to Excel...
							</div>
							<div id="csv2xlsx-fname" style="color:#9ca3af; font-size:13px; max-width:300px; word-break:break-all;"></div>
							<div id="csv2xlsx-status" style="color:#6b7280; font-size:11px; margin-top:8px;">
								Fetching data...
							</div>
							<style>
								@keyframes csv2xlsx-spin {
									to { transform: rotate(360deg); }
								}
							</style>
						</div>
					</div>
				`;
				document.body.appendChild(overlay);
				overlay.querySelector('#csv2xlsx-fname').textContent = fname;
			},
			args: [filename]
		});
	} catch (e) { /* tab may have closed */ }
}

// Update loading status text
async function updateLoadingStatus(tabId, statusText) {
	try {
		await chrome.scripting.executeScript({
			target: { tabId },
			func: (text) => {
				const el = document.getElementById('csv2xlsx-status');
				if (el) el.textContent = text;
			},
			args: [statusText]
		});
	} catch (e) { /* ignore */ }
}

// Hide loading overlay
async function hideLoading(tabId) {
	try {
		await chrome.scripting.executeScript({
			target: { tabId },
			func: () => {
				const el = document.getElementById('csv2xlsx-overlay');
				if (el) el.remove();
			}
		});
	} catch (e) { /* ignore */ }
}

// Show error in overlay then auto-dismiss
async function showError(tabId, errorMsg) {
	try {
		await chrome.scripting.executeScript({
			target: { tabId },
			func: (msg) => {
				const overlay = document.getElementById('csv2xlsx-overlay');
				if (overlay) {
					overlay.innerHTML = `
						<div style="
							position:fixed; top:0; left:0; right:0; bottom:0;
							background:rgba(0,0,0,0.5); z-index:2147483647;
							display:flex; align-items:center; justify-content:center;
							font-family:'Segoe UI',Arial,sans-serif;
						">
							<div style="
								background:#1e1e2e; border-radius:16px; padding:32px 48px;
								box-shadow:0 8px 32px rgba(0,0,0,0.4); text-align:center;
								border:1px solid rgba(239,68,68,0.3);
							">
								<div style="color:#ef4444; font-size:32px; margin-bottom:12px;">✕</div>
								<div style="color:#fff; font-size:16px; font-weight:600; margin-bottom:8px;">
									Conversion Failed
								</div>
								<div id="csv2xlsx-error-msg" style="color:#9ca3af; font-size:13px; max-width:300px;"></div>
							</div>
						</div>
					`;
					overlay.querySelector('#csv2xlsx-error-msg').textContent = msg;
					setTimeout(() => overlay.remove(), 4000);
				}
			},
			args: [errorMsg]
		});
	} catch (e) { /* ignore */ }
}

if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.onDeterminingFilename) {
	chrome.downloads.onDeterminingFilename.addListener(function(item, suggest) {
		const filename = item.filename;
		const lowerFilename = filename.toLowerCase();

		// If this is a download we triggered via a blob URL, suggest our desired custom name
		if (blobFilenameMap[item.url]) {
			const desiredName = blobFilenameMap[item.url];
			delete blobFilenameMap[item.url];
			suggest({ filename: desiredName });
			return;
		}

		// If this is a download we triggered, pass through
		if (ourDownloads.has(item.id)) {
			ourDownloads.delete(item.id);
			suggest({ filename: filename });
			return;
		}

		// Check if it's a CSV file
		if (lowerFilename.endsWith('.csv')) {
			// Cancel the original CSV download while it's paused
			chrome.downloads.cancel(item.id, () => {
				chrome.downloads.erase({ id: item.id });
				suggest({ filename: filename });
			});

			// Fetch the CSV, convert, and re-download as XLSX
			handleCsvConversion(item.url, filename);

			// Return true = async mode, keeps download paused
			return true;
		} else {
			// Non-CSV: just prepend timestamp as before
			var newFilename = appendTimestamp() + "-" + filename;
			suggest({ filename: newFilename });
		}
	});
}

async function proceedWithLargeCsv(csvData, newFilename) {
	try {
		if (activeTabId) await updateLoadingStatus(activeTabId, 'Preparing conversion...');
		
		const idbKey = 'csv_' + Date.now();
		await writeToIDB(idbKey, csvData);
		
		if (activeTabId) await updateLoadingStatus(activeTabId, 'Converting to Excel...');
		
		// Send message to offscreen to convert from IndexedDB key
		chrome.runtime.sendMessage({
			target: 'offscreen',
			type: 'convert-csv-from-idb',
			data: { idbKey, filename: newFilename }
		});
	} catch (e) {
		console.error('csv2xlsx: Failed to store or trigger IDB conversion:', e);
		if (activeTabId) await showError(activeTabId, e.message);
		stopKeepAlive();
	}
}

async function handleCsvConversion(url, originalFilename) {
	try {
		// Find the active tab
		const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
		const tabId = tabs.length > 0 ? tabs[0].id : null;
		activeTabId = tabId;

		// Show loading animation
		if (tabId) await showLoading(tabId, originalFilename);

		// Ensure offscreen doc is ready and keep SW alive
		await ensureOffscreen();
		startKeepAlive();

		// Build the new .xlsx filename with timestamp
		const baseName = originalFilename.replace(/\.csv$/i, '');
		const newFilename = appendTimestamp() + "-" + baseName + ".xlsx";

		if (tabId) {
			if (tabId) await updateLoadingStatus(tabId, 'Reading file data...');

			const transferId = 'transfer_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);

			chrome.scripting.executeScript({
				target: { tabId },
				func: async (targetUrl, targetFilename, transferId) => {
					try {
						const resp = await fetch(targetUrl);
						if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
						const csvText = await resp.text();

						const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunks
						const totalChunks = Math.ceil(csvText.length / CHUNK_SIZE);

						chrome.runtime.sendMessage({
							target: 'background',
							type: 'csv-transfer-start',
							data: { transferId, totalChunks, totalLength: csvText.length, filename: targetFilename }
						});

						for (let i = 0; i < totalChunks; i++) {
							const start = i * CHUNK_SIZE;
							const end = Math.min(start + CHUNK_SIZE, csvText.length);
							const chunk = csvText.substring(start, end);

							chrome.runtime.sendMessage({
								target: 'background',
								type: 'csv-transfer-chunk',
								data: { transferId, index: i, chunk }
							});
						}

						chrome.runtime.sendMessage({
							target: 'background',
							type: 'csv-transfer-end',
							data: { transferId }
						});
						return { success: true };
					} catch (e) {
						chrome.runtime.sendMessage({
							target: 'background',
							type: 'csv-transfer-error',
							data: { transferId, error: e.message }
						});
						return { success: false, error: e.message };
					}
				},
				args: [url, newFilename, transferId]
			}).catch(async (err) => {
				console.warn('executeScript failed, falling back to offscreen direct fetch:', err);
				if (url.startsWith('blob:')) {
					throw new Error('Scripting execution failed for blob: ' + err.message);
				}
				if (activeTabId) await updateLoadingStatus(activeTabId, 'Downloading & converting...');
				chrome.runtime.sendMessage({
					target: 'offscreen',
					type: 'convert-csv-from-url',
					data: { url, filename: newFilename }
				});
			});
		} else {
			if (url.startsWith('blob:')) {
				throw new Error('No active tab found for blob URL');
			}
			// HTTP/HTTPS URL with no tab context — let offscreen fetch directly
			chrome.runtime.sendMessage({
				target: 'offscreen',
				type: 'convert-csv-from-url',
				data: { url, filename: newFilename }
			});
		}

	} catch (e) {
		console.error('csv2xlsx: Failed to process CSV:', e);
		if (activeTabId) await showError(activeTabId, e.message);
		stopKeepAlive();
	}
}

// Listen for messages from offscreen document or content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.target !== 'background') return;

	if (message.type === 'csv-transfer-start') {
		const { transferId, totalChunks, totalLength, filename } = message.data;
		activeTransfers[transferId] = {
			chunks: new Array(totalChunks),
			receivedCount: 0,
			totalChunks,
			totalLength,
			filename
		};
	}

	if (message.type === 'csv-transfer-chunk') {
		const { transferId, index, chunk } = message.data;
		const transfer = activeTransfers[transferId];
		if (transfer) {
			transfer.chunks[index] = chunk;
			transfer.receivedCount++;
			
			const progressPercent = Math.round((transfer.receivedCount / transfer.totalChunks) * 100);
			if (activeTabId) {
				updateLoadingStatus(activeTabId, `Reading data: ${progressPercent}%`);
			}
		}
	}

	if (message.type === 'csv-transfer-end') {
		const { transferId } = message.data;
		const transfer = activeTransfers[transferId];
		if (transfer) {
			const fullCsvData = transfer.chunks.join('');
			const filename = transfer.filename;
			delete activeTransfers[transferId];
			
			proceedWithLargeCsv(fullCsvData, filename);
		}
	}

	if (message.type === 'csv-transfer-error') {
		const { transferId, error } = message.data;
		delete activeTransfers[transferId];
		console.error('csv2xlsx: transfer error:', error);
		if (activeTabId) showError(activeTabId, error);
		stopKeepAlive();
	}

	if (message.type === 'xlsx-ready') {
		const { blobUrl, filename } = message.data;

		// Map the blob URL to its desired filename
		blobFilenameMap[blobUrl] = filename;

		// Tag the next download so onDeterminingFilename doesn't re-intercept
		const listener = (downloadItem) => {
			ourDownloads.add(downloadItem.id);
		};
		chrome.downloads.onCreated.addListener(listener);

		// Hide loading overlay
		if (activeTabId) hideLoading(activeTabId);

		// Trigger save-as dialog for the XLSX
		chrome.downloads.download({
			url: blobUrl,
			filename: filename,
			saveAs: true
		});

		setTimeout(() => chrome.downloads.onCreated.removeListener(listener), 5000);
		stopKeepAlive();
	}

	if (message.type === 'convert-error') {
		console.error('csv2xlsx offscreen error:', message.error);
		if (activeTabId) showError(activeTabId, message.error);
		stopKeepAlive();
	}
});
