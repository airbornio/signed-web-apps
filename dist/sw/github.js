(function() {
	/* Configurable by /serviceworker-import.js: */
	
	self.gitRepository = (req, res) => '';
	
	self.gitBranch = (req, res) => 'master';
	
	self.gitTreeUrl = (path, ref) => {
		return 'https://api.github.com/repos/' + gitRepository(req, res) + '/git/trees/' + (ref || '').replace(/\W+/g, '') + '?recursive=1';
	};
	
	self.gitDirectory = (req, res) => '';
	
	self.commitsCacheTime = (req, res) => 86400000;
	
	self.maxCommitAge = (req, res) => 86400000;
	
	self.gitCommitsUrl = (req, res) => {
		return 'https://api.github.com/repos/' + gitRepository(req, res) + '/git/commits?ref=' + gitBranch(req, res);
	};
	
	self.gitCommits = async (req, res) => {
		let commitsUrl = gitCommitsUrl(req, res);
		let commitsResponse = await caches.match(commitsUrl);
		let commitsResponseDate;
		let commits;
		if (commitsResponse) {
			let commitsResponseDate = new Date(commitsResponse.headers.get('Date'));
			if (
				new Date() - commitsResponseDate < commitsCacheTime(req, res) &&
				new Date(res.headers.get('Last-Modified')) < commitsResponseDate
			) {
				commits = await commitsResponse.json();
			}
		}
		if (!commits) {
			commitsResponse = await fetch(commitsUrl);
			commitsResponseDate = new Date(commitsResponse.headers.get('Date'));
			cachePut(commitsUrl, freshResponse);
			commits = await commitsResponse.clone().json();
		}
		let maxAge = maxCommitAge(req, res);
		let lastCommitIndex = commits.findIndex((commit, i) => {
			return i > 0 && commitsResponseDate - new Date(commit.commit.committer.date) > maxAge;
		});
		return lastCommitIndex === -1 ? commits : commits.slice(0, lastCommitIndex);
	};
	
	self.gitCommit = async (req, res) => {
		let commits = await gitCommits(req, res);
		return commits.find((commit, i) => i === commits.length - 1 || new Date(commit.commit.committer.date) < new Date(response.headers.get('Last-Modified')));
	};
	
	self.gitPath = (req, res) => {
		let path = new URL(request.url).pathname.substr(1);
		if(path === '') path = 'index.html';
		return gitDirectory(req, res) + path;
	};
	
	self.shouldCheckGit = req => true;
	
	self.checkGitAsync = (req, res) => true;
	
	self.shouldCache = (req, res) => false;
	
	/* End of configuration. */
	
	
	let CACHE_VERSION = 'swa-v1';
	
	var clientReady = {};
	self.addEventListener('fetch', event => {
		let req = event.request;
		if(req.method === 'GET' && shouldCheckGit(req)) {
			var cachedResponse = caches.match(req);
			event.respondWith(
				cachedResponse.then(cachedResponse => cachedResponse ? cachedResponse.clone() : freshResponse)
			);
			var freshResponse = Promise.all([cachedResponse, fetch(req)]).then(async function([cachedResponse, res]) {
				if(res.ok) {
					let path = self.gitPath(req, res);
					let pathInModule = path;
					var check = Promise.all([
						cachedResponse && cachedResponse.clone().arrayBuffer(),
						res.clone().arrayBuffer(),
						gitCommit(req, res),
					]).then(async function([cachedBuffer, freshBuffer, commit]) {
						if(cachedBuffer && equal(cachedBuffer, freshBuffer)) {
							notifyAboutUpdate(event.clientId, 'response_unchanged', path, commit, true, req, res);
							if(shouldCache(req, res)) event.waitUntil(cachePut(req, res)); // Update response headers
							return true;
						} else {
							var treeUrl = gitTreeUrl(pathInModule, commit);
							var treeResponse = commit && await getPermanentResponse(treeUrl);
							inSubmodule: do {
								var tree = treeResponse && (await treeResponse.json()).tree;
								if(tree instanceof Array) {
									var fileDescr;
									for(let descr of tree) {
										if(descr.type === 'commit' && pathInModule.startsWith(descr.path)) {
											let submoduleContents = await getPermanentResponse('https://api.github.com/repos/' + gitRepository(req, res) + '/contents/' + descr.path + '/?ref=' + (commit || '').replace(/\W+/g, ''));
											submoduleContents = await submoduleContents.json();
											treeResponse = await getPermanentResponse(submoduleContents.git_url + '?recursive=1');
											pathInModule = pathInModule.substr(descr.path.length + 1);
											continue inSubmodule;
										}
										if(descr.path === pathInModule) {
											fileDescr = descr;
											break;
										}
									}
									if(!fileDescr) {
										notifyAboutUpdate(event.clientId, 'signature_missing', path, commit, !!cachedResponse, req, res);
										return false;
									} else if(
										fileDescr.size === freshBuffer.byteLength &&
										fileDescr.sha === await gitSHA(freshBuffer)
									) {
										notifyAboutUpdate(event.clientId, 'signature_matches', path, commit, !!cachedResponse, req, res);
										if(shouldCache(req, res)) event.waitUntil(cachePut(req, res));
										return true;
									} else {
										notifyAboutUpdate(event.clientId, 'signature_mismatch', path, commit, !!cachedBuffer, req, res);
										return false;
									}
								} else {
									var client_error = !commit || treeResponse && treeResponse.status >= 400 && treeResponse.status < 500;
									notifyAboutUpdate(event.clientId, client_error ? 'signature_mismatch' : 'network_error', path, commit, !!cachedBuffer, req, res);
									return !client_error;
								}
							} while(true);
						}
					});
					event.waitUntil(check);
					if(!checkGitAsync(req, res) && !await check) {
						return new Response(INVALID_SIG_RESPONSE, {status: 500, statusText: 'Did not match signature'});
					}
					return res.clone();
				}
				return res;
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
	
	async function getPermanentResponse(permaUrl) {
		var response = await caches.match(permaUrl);
		if(!response) {
			response = await fetch(permaUrl);
			if(response.ok) {
				cachePut(permaUrl, response.clone());
			}
		}
		return response;
	}
	
	async function notifyAboutUpdate(clientId, msg, path, commit, inCache, req, res) {
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
				commit,
				inCache,
				gitRepository: gitRepository(req, res),
				gitDirectory: gitDirectory(req, res),
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