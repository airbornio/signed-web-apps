# Signed Web Apps

**Note:** This library isn't finished yet. Please check back later.

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

## Why check GitHub? Why not just sign the code using public key crypto?

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

1.  Include this repository under your project:

        git submodule add -b master https://github.com/airbornio/signed-web-apps.git

2.  The following code should be included on **every page** of your web
    app (even 404 and other error pages). If you don't, an attacker
    could send users to a page without it, and the library would have no
    way of warning users of any malicious code on the page.

        <script src="signed-web-apps/client.js"></script>
        <script>
        new SWA({
            url: 'signed-web-apps/sw/serviceworker.js'
        });
        </script>

3.  Create a file called `swa-serviceworker.js` in the root of your
    domain. This file will (1) import other parts of the library and
    (2) tell the library where on GitHub to find your files. Let's say
    your files are in a directory called `dist` in a certain repository.
    Then this file should contain something like:
    
        await importScripts('signed-web-apps/sw/github.js');
        
        const GITHUB_API_URL = 'https://api.github.com/repos/<your-github-username>/<your-github-repo>/contents/?ref=';
        
        function getGitHubPath(request) {
            let path = new URL(request.url).pathname;
            if(path === '/') path = '/index.html';
            return 'dist' + path;
        }
    
    In this file, you can execute code and register for events like a
    normal Service Worker, with two important exceptions:
    
    1.  importScripts() is not synchronous, so you need to put `await`
        in front of it. This is also why the example above is wrapped in
        an asynchronous [immediately-executed function
        expression][IIFE].
    
    2.  You can only register for `fetch`, `message`, `install` and
        `activate` events. If you want to register for other events, you
        have to manually add them to the `eventNames` list in
        `signed-web-apps/sw/serviceworker.js`.
    
    For more info about the kind of code you can write in this file, see
    [swa-config].
    
    If you want to add another (possibly unrelated) Service Worker
    script (or already have one), don't register it manually. Instead,
    import it from the file above. Be careful though, since the two may
    not play nicely together.

4.  Update often. (Please see the note above the installation
    instructions for the reasons why.) Preferably add this to your
    install or build script:

        git submodule update --remote


[TOFU]: https://en.wikipedia.org/wiki/Trust_on_first_use
[CSP]: https://developer.mozilla.org/docs/Web/HTTP/CSP
[SRI]: https://developer.mozilla.org/docs/Web/Security/Subresource_Integrity
[IIFE]: https://developer.mozilla.org/docs/Glossary/IIFE