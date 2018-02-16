(function() {
	const STUB_CACHE_VERSION = 'swa-v1';

	const importUrl = registration.scope + 'swa-serviceworker.js';

	const eventTarget = new EventTarget();

	const eventNames = ['install', 'activate', 'fetch', 'message'];

	let import;

	self.addEventListener('install', event => {
		console.log('install handler #1');
		event.waitUntil(async () => {
			await import;
			let newImport = await fetchFromSW(new Request(importUrl));
			if(!newImport.ok) {
				// Cancel installation.
				throw new Error('Fetching Service Worker import failed.');
			}
			await cache.put(importUrl, newImport);
			console.log('added');
			
			// Run new import.
			import = runImport();
		});
	});

	for(let eventName of eventNames) {
		self.addEventListener(eventName, event => {
			console.log(eventName, 'event');
			event.waitUntil(async () => {
				await import;
				eventTarget.dispatchEvent(event);
			});
		});
	}

	self.addEventListener = eventTarget.addEventListener;
	self.removeEventListener = eventTarget.removeEventListener;

	import = runImport();

	async function runImport() {
		let import = await caches.match(importUrl);
		if(import) self.eval(await import.text());
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
})();