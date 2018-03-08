const form = document.querySelector('form');
const result = document.getElementById('result');
form.addEventListener('input', onInput);
form.addEventListener('change', onInput);
form.addEventListener('reset', setTimeout.bind(this, onInput, 0, true));

let config = JSON.parse(localStorage.config || '{}');
for (const [key, value] of Object.entries(config)) {
    if (form[key]) {
        form[key].value = value;
    }
}

function onInput(evt) {
    const formData = new FormData(form);
    const data = {};
    for (const [key, value] of formData) {
        if (value) {
            data[key] = value;
        }
    }
    result.innerHTML = generateConfig(data);
    form.style.minHeight = result.offsetHeight + 50 + 'px';
    if (evt) {
        localStorage.config = JSON.stringify(data);
    }
}

const defaultConfig = generateConfig({}, false);
const defaultParts = defaultConfig.split('\n\n');

onInput();

const advanced = document.getElementById('advanced');
const advancedConfigs = document.querySelectorAll('.advancedConfig');
advanced.addEventListener('click', function(evt) {
    evt.preventDefault();
    advancedConfigs.forEach(advancedConfig => {
        this.innerHTML = advancedConfig.classList.toggle('hidden') ? 'Advanced &darr;' : 'Advanced &uarr;';
    });
});

if (generateConfig(config) !== generateConfig({repository: config.repository, branch: config.branch, directory: config.directory})) {
    advanced.click();
}

function markInterpolate(strings, ...interpolations) {
    return strings[0] + interpolations.map((interp, i) => `<mark>${(interp + '').replace(/</g, '&lt;')}</mark>${strings[i + 1]}`).join('');
}


function generateConfig({
    repository = '',
    branch = 'master',
    directory = '',
    cacheCommits = '1',
    maxCommitAge = '1',
    chooseCommitBy = 'lastModified',
    gitHashResponseHeader = 'Git-Commit',
    index = 'index.html',
    appendDotHtml = 'no',
    ignorePaths = '',
    staleWhileRevalidate = 'no',
}, removeDefaultCode = true) {
    const j = JSON.stringify;
    const config = markInterpolate`(async () => {

    await importScriptsFromSW("signed-web-apps/dist/sw/github.js");

    self.gitRepository = () => ${j(repository)};

    self.gitBranch = () => ${j(branch)};

    self.gitDirectory = () => ${j(directory ? directory + '/' : '')};

    self.commitsCacheTime = () => ${cacheCommits * 24 * 60 * 60 * 1000};

    self.maxCommitAge = () => ${maxCommitAge * 24 * 60 * 60 * 1000};

    self.gitCommit = async (request, response) => {
        let commits = await gitCommits(request, response);
        ${
            chooseCommitBy === 'lastModified' ? `return commits.find(commit => new Date(commit.commit.committer.date) < new Date(response.headers.get("Last-Modified")));` :
            chooseCommitBy === 'responseHeader' ? `return commits.find(commit => commit.sha === response.headers.get(${j(gitHashResponseHeader)}));` :
            chooseCommitBy === 'latest' ? `return commits[0];` : ''
        }
    };

    self.gitPath = (request, response) => {
        let path = new URL(request.url).pathname.substr(1);
        if (path === "") path = ${j(index)};` + (appendDotHtml === 'yes' ? markInterpolate`
        ${`else if (!path.includes(".")) path += ".html";`}` : '') + markInterpolate`
        return gitDirectory(request, response) + path;
    };

    self.shouldCheckGit = request => {
        if (request.integrity) return false;
        let path = new URL(request.url).pathname.substr(1);
        return !${j(ignorePaths
            .split(/\r?\n/)
            .map(path => path.replace(/^\//, ''))
            .filter(path => path)
        )}.some(ignore => path.startsWith(ignore));
    };

    self.shouldCache = () => ${staleWhileRevalidate === 'yes'};

})();`;
    if (removeDefaultCode) {
        return config.split('\n\n').filter((part, i, parts) => {
            return i < 2 || i === parts.length - 1 || part !== defaultParts[i];
        }).join('\n\n');
    }
    return config;
}