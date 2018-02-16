const STUB_CACHE_VERSION = 'twa-sw-stub-v1';

const importUrls = ['twa-sw-github.js', 'twa-sw-config.js'];

const eventTarget = new EventTarget();

const eventNames = ['install', 'activate', 'fetch', 'message'];

let imports;

self.addEventListener('install', event => {
	console.log('install handler #1');
	event.waitUntil(async () => {
		await imports;
		let cache = await caches.open(STUB_CACHE_VERSION);
		for(let importUrl of importUrls) {
			let newImport = await fetchFromSW(new Request(importUrl));
			if(!newImport.ok) {
				// Cancel installation.
				throw new Error('Fetching Service Worker import failed.');
			}
			await cache.put(importUrl, newImport);
		}
		console.log('added');
		
		// Run new imports.
		imports = runImports();
	});
});

for(let eventName of eventNames) {
	self.addEventListener(eventName, event => {
		console.log(eventName, 'event');
		event.waitUntil(async () => {
			await imports;
			eventTarget.dispatchEvent(event);
		});
	});
}

self.addEventListener = eventTarget.addEventListener;
self.removeEventListener = eventTarget.removeEventListener;

imports = runImports();

async function runImports() {
	let import;
	for(let importUrl of importUrls) {
		import = await caches.match(importUrl);
		if(import) self.eval(await import.text());
	}
	return import;
}

async function fetchFromSW(request) {
	await new Promise(resolve => {
		let event = new FetchEvent('fetch', {request});
		let resolved = false;
		event.respondWith = response => {
			console.log('respondWith called');
			resolve(response);
			resolved = true;
		};
		self.dispatchEvent(event);
		console.log('dispatched. resolved: ' + resolved);
		setTimeout(() => {
			console.log('resolved: ' + resolved);
			if(!resolved) {
				resolve(fetch(request));
			}
		});
	});
}