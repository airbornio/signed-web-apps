(function() {
	/* Configurable by /serviceworker-import.js: */
	
	self.GITHUB_REPOSITORY = '';
	
	self.getGitHubUrl = (path, ref) => {
		return 'https://api.github.com/repos/' + GITHUB_REPOSITORY + '/git/trees/' + (ref || '').replace(/\W+/g, '') + '?recursive=1';
	};
	
	self.GITHUB_DIRECTORY = '';
	
	self.getGitHubPath = request => {
		let path = new URL(request.url).pathname.substr(1);
		if(path === '') path = 'index.html';
		return GITHUB_DIRECTORY + path;
	};
	
	self.shouldCheckGitHub = path => true;
	
	self.checkGitHubAsync = path => true;
	
	self.shouldCache = path => false;
	
	/* End of configuration. */
	
	
	let CACHE_VERSION = 'swa-v1';
	
	var clientReady = {};
	self.addEventListener('fetch', event => {
		var path = getGitHubPath(event.request);
		let githubPath = path;
		if(event.request.method === 'GET' && shouldCheckGitHub(path)) {
			var cachedResponse = caches.match(event.request);
			event.respondWith(
				cachedResponse.then(cachedResponse => cachedResponse ? cachedResponse.clone() : freshResponse)
			);
			var freshResponse = Promise.all([cachedResponse, fetch(event.request)]).then(async function([cachedResponse, freshResponse]) {
				if(freshResponse.ok) {
					var check = Promise.all([
						cachedResponse && cachedResponse.clone().arrayBuffer(),
						freshResponse.clone().arrayBuffer(),
					]).then(async function([cachedBuffer, freshBuffer]) {
						var githubCommit = freshResponse.headers.get('X-GitHub-Commit');
						if(cachedBuffer && equal(cachedBuffer, freshBuffer)) {
							notifyAboutUpdate(event.clientId, 'response_unchanged', path, githubCommit);
							if(shouldCache(path)) event.waitUntil(cachePut(event.request, freshResponse)); // Update X-GitHub-Commit
							return true;
						} else {
							var githubUrl = getGitHubUrl(githubPath, githubCommit);
							var githubResponse = githubCommit && await getGitHubResponse(githubUrl);
							inSubmodule: do {
								var githubContents = githubResponse && (await githubResponse.json()).tree;
								if(githubContents instanceof Array) {
									var fileDescr;
									for(let descr of githubContents) {
										if(descr.type === 'commit' && githubPath.startsWith(descr.path)) {
											let submoduleContents = await getGitHubResponse('https://api.github.com/repos/' + GITHUB_REPOSITORY + '/contents/' + descr.path + '/?ref=' + (githubCommit || '').replace(/\W+/g, ''));
											submoduleContents = await submoduleContents.json();
											githubResponse = await getGitHubResponse(submoduleContents.git_url + '?recursive=1');
											githubPath = githubPath.substr(descr.path.length + 1);
											continue inSubmodule;
										}
										if(descr.path === githubPath) {
											fileDescr = descr;
											break;
										}
									}
									if(!fileDescr) {
										notifyAboutUpdate(event.clientId, 'signature_missing', path, githubCommit, !!cachedResponse);
										return false;
									} else if(
										fileDescr.size === freshBuffer.byteLength &&
										fileDescr.sha === await gitSHA(freshBuffer)
									) {
										notifyAboutUpdate(event.clientId, 'signature_matches', path, githubCommit, !!cachedResponse);
										if(shouldCache(path)) event.waitUntil(cachePut(event.request, freshResponse));
										return true;
									} else {
										notifyAboutUpdate(event.clientId, 'signature_mismatch', path, githubCommit, !!cachedBuffer);
										return false;
									}
								} else {
									var client_error = !githubCommit || githubResponse && githubResponse.status >= 400 && githubResponse.status < 500;
									notifyAboutUpdate(event.clientId, client_error ? 'signature_mismatch' : 'network_error', path, githubCommit, !!cachedBuffer);
									return !client_error;
								}
							} while(true);
						}
					});
					event.waitUntil(check);
					if(!checkGitHubAsync(path) && !await check) {
						return new Response(INVALID_SIG_RESPONSE, {status: 500, statusText: 'Did not match signature'});
					}
					return freshResponse.clone();
				}
				return freshResponse;
			});
			event.waitUntil(freshResponse);
		}
		BEFORE_FIRST_FETCH = false;
	});
	
	var clientReady = {};
	var onClientReady = {};
	self.addEventListener('message', event => {
		if(event.data.msg === 'ready') {
			if(onClientReady[event.source.id]) {
				onClientReady[event.source.id]();
			} else {
				clientReady[event.source.id] = Promise.resolve();
			}
		}
	});
	
	async function getGitHubResponse(githubUrl) {
		var response = await caches.match(githubUrl);
		if(!response) {
			response = await fetch(githubUrl);
			if(response.ok) {
				cachePut(githubUrl, response.clone());
			}
		}
		return response;
	}
	
	async function notifyAboutUpdate(clientId, msg, path, githubCommit, inCache) {
		var clientList = clientId ? [await clients.get(clientId)] : await clients.matchAll({
			includeUncontrolled: true,
			type: 'window',
		});
		clientList.forEach(async function(client) {
			// For the first few requests (e.g. the html file and the first css
			// file) the client might not be ready for messages yet (no message
			// event handler installed yet). Therefore, we wait until we get a
			// message that it's ready.
			await (clientReady[client.id] || (clientReady[client.id] = new Promise(function(resolve) {
				onClientReady[client.id] = resolve;
			})));
			client.postMessage({
				action: 'urlChecked',
				msg,
				path,
				githubCommit,
				inCache,
				GITHUB_REPOSITORY,
				GITHUB_DIRECTORY,
			});
		});
	}
	
	function cachePut(request, response) {
		return caches.open(CACHE_VERSION).then(cache => cache.put(request, response));
	}
	
	// https://stackoverflow.com/questions/460297/git-finding-the-sha1-of-an-individual-file-in-the-index/24283352
	async function gitSHA(buffer) {
		var prefix = 'blob ' + buffer.byteLength + '\0';
		var prefixLen = prefix.length;
		var newBuffer = new ArrayBuffer(buffer.byteLength + prefixLen);
		var view = new Uint8Array(newBuffer);
		for(var i = 0; i < prefixLen; i++) {
			view[i] = prefix.charCodeAt(i);
		}
		view.set(new Uint8Array(buffer), prefixLen);
		return hex(await crypto.subtle.digest('sha-1', newBuffer));
	}
	
	// https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
	function hex(buffer) {
		var view = new DataView(buffer);
		var hexParts = [];
		for(var i = 0; i < view.byteLength; i += 4) {
			hexParts.push(('00000000' + view.getUint32(i).toString(16)).slice(-8));
		}
		return hexParts.join('');
	}
	
	// https://stackoverflow.com/questions/21553528/how-can-i-test-if-two-arraybuffers-in-javascript-are-equal
	function equal(buf1, buf2) {
		if(buf1.byteLength !== buf2.byteLength) return false;
		var dv1 = new Int8Array(buf1);
		var dv2 = new Int8Array(buf2);
		for(var i = 0; i !== buf1.byteLength; i++) {
			if(dv1[i] !== dv2[i]) return false;
		}
		return true;
	}
	
	var BEFORE_FIRST_FETCH = true;
	registration.addEventListener('updatefound', function(event) {
		// When the service worker gets updated, there may not necessarily be a
		// client that can show a message for us (e.g., it may be triggered by a 404
		// page). Therefore, we show a web notification.
		if(!BEFORE_FIRST_FETCH) {
			self.registration.showNotification('Airborn OS has been updated.', {
				body: "We can't be sure that it's an update that's publicly available on GitHub. Please check that you trust this update or stop using this version of Airborn OS.",
				icon: 'images/logo-mark.png'
			});
		}
	});
})();