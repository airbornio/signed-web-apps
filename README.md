# Signed Web Apps

**Note:** This library isn't finished yet. Please check back later.

## What is it?

This is a JavaScript library to protect the HTML, JS and CSS in web apps
from tampering by malicious servers or developers. It does this by
installing some code in a [Service Worker][SW], which checks the code
every time you open the web app. In effect, this makes it [Trust on
First Use][TOFU].

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

**Example app:**

[Example app running on Heroku][swa-example] ([code on
GitHub][swa-example-gh]).

**Installation:**

1.  Include this repository under your project:

        git submodule add -b master https://github.com/airbornio/signed-web-apps.git

2.  The following code should be included on **every page** of your web
    app (even 404 and other error pages). If you don't, an attacker
    could send users to a page without it, and the library would have no
    way of warning users of any malicious code on the page.

    ```html
    <script src="/signed-web-apps/dist/client.js"></script>
    <script>
    let swa = new SWA({
        url: '/signed-web-apps/dist/sw/serviceworker-stub.js',
    });
    swa.addEventListener('urlChecked', event => {
        let data = event.data;
        if(data.msg === 'signature_matches' || data.msg === 'response_unchanged') {
            // SUCCESS
        } else {
            // data.msg is 'signature_mismatch' or 'signature_missing' or 'network_error'
            alert(data.msg + ': ' + data.path);
        }
    });
    swa.addEventListener('error', event => {
        // event.code is 'sw_not_supported' or 'sw_failed'
        alert(event.code + ': ' + event.message);
    });
    </script>
    ```

3.  Configure your server to serve
    `/signed-web-apps/dist/sw/serviceworker-stub.js` with a
    `Service-Worker-Allowed: /` header.
    
    Alternatively, copy that file to the root of your domain, and update
    the url in step 2.

4.  Create a file called `serviceworker-import.js` in the root of your
    domain. This file will (1) import other parts of the library and
    (2) tell the library where on GitHub to find your files.
    
    [Generate your configuration code here][generate-config] and
    copy+paste it to that file.

5.  Make sure that your server serves `Last-Modified` headers that
    correspond to either the date when you last pushed files to your
    server, or the date when the specific file changed on your server
    (the latter may lead to an increase in GitHub API requests in some
    cases, though).
    
    The default configuration from the previous step assumes that you:
    
    -   Push to GitHub *before* you push to your server, and that the
        date in the `Last-Modified` header is later than when you pushed
        to GitHub.
    -   Always push to your server within a day of pushing to GitHub.
        It's probably a good idea to set up a `production` branch for
        this purpose.
    -   Don't push an old commit to your server. If you want to rollback
        your server to an older version, it's probably best to create a
        revert commit and push it to GitHub and your server.

6.  Update often. (Please see the note above the installation
    instructions for the reasons why.) Preferably add this to your
    install or build script:

        git submodule update --remote
    
    If you copied `serviceworker-stub.js` to the root of your domain in
    step 3, don't forget to do so whenever you update.


[SW]: https://developer.mozilla.org/docs/Web/API/Service_Worker_API
[TOFU]: https://en.wikipedia.org/wiki/Trust_on_first_use
[CSP]: https://developer.mozilla.org/docs/Web/HTTP/CSP
[SRI]: https://developer.mozilla.org/docs/Web/Security/Subresource_Integrity
[swa-example]: https://signed-web-apps-example.herokuapp.com/
[swa-example-gh]: https://github.com/airbornio/signed-web-apps-example
[generate-config]: https://airbornio.github.io/signed-web-apps/generate-config.html