# Transparent Web Apps

## What is it?

This is a JavaScript library to protect the HTML, JS and CSS in web apps
from tampering by malicious servers or developers. It does this by
checking code against the publicly available version on GitHub. It also
checks the code every next time you open the web app, using Service
Workers. In effect, this makes it [Trust on First Use][TOFU].

## What web apps is this for?

Most web apps inherently require you to trust the servers and developers
(for example, because they send your data to the server). However, some
do not. This can either be because they store and process your data
entirely on the client, in JavaScript, or because data is encrypted on
the client before it is sent to the server. This library is meant for
those web apps.

## So what's the problem this solves?

When you open a web app, all of its code is delivered by its web server.
It is fairly trivial for the operators of that server to one day decide
to serve you code that *does* send your data to the server, or *doesn't*
encrypt it before doing so. Similarly, a hacker which compromised the
server can do the same. Even worse, a malicious developer could target
*just one or a few* users, and serve them malicious code. That would be
almost impossible to detect.

## Why not just sign the code? Why check GitHub?

Merely signing the code, and delivering public key signatures together
with the code which are checked against a public key, does not solve the
last attack mentioned in the previous paragraph. After all, the
developers could write some malicious code, sign it, and then deliver
both to a target user.

## How do I use it?

This library is a building block, just as encryption is a building
block. It does not, by itself, "make your web app secure". In
particular, it does not attempt to verify that all code in the web app
is checked, and that it does not `eval()` other, untrusted code, etc. To
check that, you should make use of a [Content Security Policy][CSP].

As a general rule, if all code in your web app comes from your own
server, or from a third-party server while using [Subresource
Integrity][SRI], and you use an appropriate [Content Security
Policy][CSP] to verify all that, *and* all the client-side code from
your server is on GitHub and verified by this library, then you're set.

**Note:** This library is experimental and subject to change (as is its
API). To a lesser extent, so is the Service Worker API and its support
by browsers. Therefore, if you decide to use it, update this library
often to stay up-to-date with security patches.

**Installation:**

1.  Include the `lib` directory of this repository in your project under
    the name `twa`:

        bower install --save twa#latest
        cp -r bower_components/twa/lib twa
    
    You don't have to use bower, you could also e.g. use git
    subrepositories:
    
        git submodule add -b master https://github.com/airborn/twa.git lib

2.  Create a file called `twa-config.json` in the root of your web app.
    (It doesn't have to be the root of the domain, but it can't be in a
    subdirectory of your web app unless you manually change
    `twa/sw/serviceworker.js`). It should contain:
    
        {
            "importScripts": [
                "twa/sw/github.js",
                "twa-github-config.js"
            ]
        }
    
    If you already have a Service Worker on the same scope, or want to
    add one, add it to this list instead of registering it manually. For
    more info see [twa-config][here].

3.  Create a file called `twa-github-config.js` (or something else, as
    long as the list above points to it). This file will tell the
    library where on GitHub to find your files. Let's say your files are
    in a directory called `dist` in a certain repository. Then this file
    should contain something like:
    
        const GITHUB_API_URL = 'https://api.github.com/repos/<your-github-username>/<your-github-repo>/contents/?ref=';
        
        function getGitHubPath(request) {
            let path = new URL(request.url).pathname;
            if(path === '/') path = '/index.html';
            return 'dist' + path;
        }

4.  Update often. Preferably add this to your install or build script:

        bower install
        cp -r bower_components/twa/lib twa
    
    Or, if you're using git submodules:
    
        git submodule update --remote
    


[TOFU]: https://en.wikipedia.org/wiki/Trust_on_first_use
[CSP]: https://developer.mozilla.org/docs/Web/HTTP/CSP
[SRI]: https://developer.mozilla.org/docs/Web/Security/Subresource_Integrity
[IIFE]: https://developer.mozilla.org/docs/Glossary/IIFE
[twa-config]: 