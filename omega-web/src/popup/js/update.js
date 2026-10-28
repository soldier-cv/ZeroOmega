(function() {
  // The release server publishes this file on every tag (CI runs
  // tools/ci/refresh_res_manifest.py), so the popup never hard-codes a version.
  var MANIFEST_URL = 'http://100.64.0.88:8088/res/zeroomega/manifest.json';
  var GUIDE_URL = 'http://100.64.0.88:8088/res/zeroomega/INSTALL.md';
  var CACHE_KEY = 'omega.update';
  var CHECK_EVERY = 6 * 60 * 60 * 1000;
  // Used only when the server drops the command from its manifest; the install
  // guide documents the same two steps.
  var FALLBACK_COMMAND = 'iwr ' +
    'http://100.64.0.88:8088/res/zeroomega/chromium-release.zip ' +
    '-OutFile $env:TEMP\\zo.zip; Expand-Archive $env:TEMP\\zo.zip ' +
    '-DestinationPath "$env:LOCALAPPDATA\\zeroomega" -Force';

  var state = {
    latest: '',
    command: '',
    checkedAt: 0,
    checking: false,
    failed: false,
    copied: false,
    openedGuide: false,
  };

  $script.ready('om-target', init);
  return;

  function init() {
    var cache = loadCache();
    state.latest = cache.version || '';
    state.command = cache.command || '';
    state.checkedAt = cache.checkedAt || 0;

    click('js-update', onCheckClick);
    click('js-reload', function() {
      // The new files are already on disk by now; this is what the install
      // guide asks for as its last step.
      chrome.runtime.reload();
    });
    render();
    check(false);
  }

  function click(id, handler) {
    var element = document.getElementById(id);
    if (!element) return;
    element.addEventListener('click', function(event) {
      event.preventDefault();
      handler();
    });
  }

  // A newer build is the only state that needs an action; everything else just
  // answers "am I current?".
  function onCheckClick() {
    if (state.checking) return;
    if (isNewer(state.latest)) {
      copyCommand();
      return;
    }
    state.failed = false;
    check(true);
  }

  function render() {
    var row = document.getElementById('js-update-row');
    var label = document.getElementById('js-update-label');
    var reloadRow = document.getElementById('js-reload-row');
    var reloadLabel = document.getElementById('js-reload-label');
    if (!row || !label) return;
    var available = isNewer(state.latest);

    label.textContent = updateLabel(available);
    row.classList.toggle('om-update-new', available);
    row.classList.toggle('om-disabled', state.checking);
    row.setAttribute('title', getMessage(state.checking ? 'popup_updateChecking' :
      available ? (state.copied || state.openedGuide ?
        'popup_reloadHelp' : 'popup_updateHelp') : 'popup_checkUpdateHelp'));

    if (reloadRow) reloadRow.classList.toggle('om-hidden', !available);
    if (reloadLabel) reloadLabel.textContent = getMessage('popup_reloadExtension');
    if (reloadRow) reloadRow.setAttribute('title', getMessage('popup_reloadHelp'));
  }

  function updateLabel(available) {
    if (state.checking) return getMessage('popup_updateChecking');
    if (state.copied) return getMessage('popup_updateCopied');
    if (state.openedGuide) return getMessage('popup_updateOpenedGuide');
    if (available) return getMessage('popup_updateAvailable', [state.latest]);
    if (state.failed) return getMessage('popup_updateFailed');
    if (!state.latest) return getMessage('popup_checkUpdate');
    // Name the running build here: the server's version can be older than a
    // local dev build, and "up to date" is about this copy.
    return getMessage('popup_updateLatest', [localVersion()]);
  }

  function check(force) {
    if (state.checking) return;
    if (!force && state.checkedAt &&
        Date.now() - state.checkedAt < CHECK_EVERY) {
      return;
    }
    state.checking = true;
    render();
    fetch(MANIFEST_URL, {cache: 'no-store'}).then(function(response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    }).then(function(data) {
      state.checking = false;
      state.failed = false;
      state.copied = false;
      state.openedGuide = false;
      state.latest = data && data.version || '';
      state.command = commandFrom(data);
      state.checkedAt = Date.now();
      saveCache();
      render();
    }).catch(function() {
      state.checking = false;
      state.failed = true;
      render();
    });
  }

  // The server knows the download path and the extract target, so the command
  // is taken from its manifest instead of being duplicated here.
  function commandFrom(data) {
    var links = data && data.links || [];
    for (var i = 0; i < links.length; i++) {
      if (links[i] && links[i].command) return links[i].command;
    }
    return FALLBACK_COMMAND;
  }

  function copyCommand() {
    var text = state.command || FALLBACK_COMMAND;
    writeClipboard(text).then(function(copied) {
      state.copied = copied;
      state.openedGuide = !copied;
      // Clipboard access can be refused; the install guide shows the same
      // command in that case.
      if (!copied) window.open(GUIDE_URL, '_blank');
      render();
    });
  }

  function writeClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function() {
        return true;
      }, function() {
        return legacyCopy(text);
      });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    document.body.appendChild(area);
    area.select();
    var copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (_) {
      copied = false;
    }
    document.body.removeChild(area);
    return copied;
  }

  function localVersion() {
    return chrome.runtime.getManifest().version;
  }

  function localVersion() {
    return chrome.runtime.getManifest().version;
  }

  // Versions look like "3.6.4" locally and "v3.6.4" (or "v3.6.4-custom") on the
  // server, so only the numeric part is compared.
  function isNewer(latest) {
    var remote = numbers(latest);
    var local = numbers(localVersion());
    if (!remote || !local) return false;
    for (var i = 0; i < Math.max(remote.length, local.length); i++) {
      var a = remote[i] || 0;
      var b = local[i] || 0;
      if (a !== b) return a > b;
    }
    return false;
  }

  function numbers(version) {
    var match = String(version || '').match(/\d+(?:\.\d+)*/);
    if (!match) return null;
    return match[0].split('.').map(Number);
  }

  function loadCache() {
    try {
      return JSON.parse(globalThis.localStorage.getItem(CACHE_KEY)) || {};
    } catch (_) {
      return {};
    }
  }

  function saveCache() {
    try {
      globalThis.localStorage.setItem(CACHE_KEY, JSON.stringify({
        version: state.latest,
        command: state.command,
        checkedAt: state.checkedAt,
      }));
    } catch (_) {
    }
  }

  function getMessage(id, args) {
    return OmegaTargetPopup.getMessage(id, args);
  }
})();
