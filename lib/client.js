class SWA extends EventTarget {
	constructor(config) {
		super();
		if('serviceWorker' in navigator) {
			navigator.serviceWorker.register(config.url, {
				scope: '/',
			}).then(function(registration) {
				navigator.serviceWorker.ready.then(function() {
					registration.active.postMessage({
						msg: 'ready',
					});
				});
				
				registration.addEventListener('updatefound', function(event) {
					if(registration.active !== null) { // If there is an active Service Worker...
						notifyAboutUpdate('updatefound', 'serviceworker.js'); // ... notify that there's a new one.
					}
				});
			}).catch(err => {
				console.error(err);
				let errEvent = new ErrorEvent('error', {message: 'Service Worker failed to install.'});
				errEvent.code = 'sw_failed';
				this.dispatchEvent(errEvent);
			});
			
			navigator.serviceWorker.addEventListener('message', event => {
				this.dispatchEvent(new event.constructor(event.data.action, event));
			});
		} else {
			setTimeout(() => {
				let errEvent = new ErrorEvent('error', {message: 'Service Workers are not supported in your browser.'});
				errEvent.code = 'sw_not_supported';
				this.dispatchEvent(errEvent);
			});
		}
	}
}