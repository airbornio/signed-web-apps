(function() {
	const CACHE_VERSION_STUB = 'swa-stub-v1';
	const CACHE_VERSION_IMPORTS = 'swa-imports-v1';

	const importUrl = absoluteUrl('serviceworker-import.js');

	const eventTarget = new EventTarget();

	const eventNames = ['install', 'activate', 'fetch', 'message'];

	let importDone;

	self.addEventListener('install', event => {
		console.log('install handler #1');
		event.waitUntil((async () => {
			await importDone;
			let newImport = await fetchFromSW(importUrl);
			if(!newImport.ok) {
				// Cancel installation.
				throw new Error('Fetching Service Worker import failed.');
			}
			let cache = await caches.open(CACHE_VERSION_STUB);
			await cache.put(importUrl, newImport);
			console.log('added');
			
			// Run new import.
			await (importDone = runImport());
		})());
	});
	
	let updateImports = false;
	self.addEventListener('activate', event => {
		// let cache = await caches.open(CACHE_VERSION_IMPORTS);
		// cache.clear();
		
		updateImports = true;
	});
	
	for(let eventName of eventNames) {
		self.addEventListener(eventName, event => {
			console.log(eventName, 'event');
			event.waitUntil((async () => {
				await importDone;
				let eventClone = new event.constructor(event.type, event);
				eventTarget.dispatchEvent(eventClone);
			})());
		});
	}
	
	self.addEventListener = eventTarget.addEventListener;
	self.removeEventListener = eventTarget.removeEventListener;
	
	self.eventTarget = eventTarget;
	
	console.log('addEventListener set');
	
	importDone = runImport();
	
	async function runImport() {
		let response = await caches.match(importUrl);
		if(response) await self.eval(await response.text() + '\n//# sourceURL=' + importUrl);
		return response;
	}
	
	async function fetchFromSW(url) {
		let request = new Request(url);
		return await new Promise(resolve => {
			let event = new FetchEvent('fetch', {request});
			let resolved = false;
			event.respondWith = response => {
				console.log('respondWith called');
				resolve(response);
				resolved = true;
			};
			event.waitUntil = () => {};
			eventTarget.dispatchEvent(event);
			console.log('dispatched. resolved: ' + resolved);
			setTimeout(() => {
				console.log('resolved: ' + resolved);
				if(!resolved) {
					resolve(fetch(request));
				}
			});
		});
	}
	
	self.importScriptsFromSW = async function(...scripts) {
		let cache = await caches.open(CACHE_VERSION_IMPORTS);
		await Promise.all(scripts.map(async script => {
			script = absoluteUrl(script);
			let response = await cache.match(script);
			if(!response || updateImports) {
				try {
					let newImport = await fetchFromSW(script);
					if(newImport.ok) {
						cache.put(script, newImport.clone());
						response = newImport;
					}
				} catch(e) {}
			}
			await self.eval(await response.text() + '\n//# sourceURL=' + script);
		}));
	};
	
	function absoluteUrl(url) {
		return new URL(url, registration.scope).href;
	}
})();