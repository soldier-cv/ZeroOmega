(function() {

  var profileTemplate = document.getElementById('js-profile-tpl')
    .cloneNode(true);
  profileTemplate.removeAttribute('id');
  profileTemplate.classList.remove('om-hidden');

  var iconForProfileType = {
    'DirectProfile': 'glyphicon-transfer',
    'SystemProfile': 'glyphicon-off',
    'AutoDetectProfile': 'glyphicon-file',
    'FixedProfile': 'glyphicon-globe',
    'PacProfile': 'glyphicon-file',
    'VirtualProfile': 'glyphicon-question-sign',
    'RuleListProfile': 'glyphicon-list',
    'SwitchProfile': 'glyphicon-retweet',
  };
  var orderForType = {
    'FixedProfile': -2000,
    'PacProfile': -1000,
    'VirtualProfile': 1000,
    'SwitchProfile': 2000,
    'RuleListProfile': 3000,
  };

  // Every site has its own rule. The popup no longer switches scopes: a click
  // sets this host's rule, and the check marks it. A host without a rule is
  // seeded on first open from the route actually in effect (a wider rule, else
  // the default profile), so seeding never changes where the page goes.
  var pageInfoToken = 0;
  var LINK_PREF = 'omega.popup.linkGroup';
  var linkPref = null;

  $script.ready('om-state', updateMenuByState);
  $script.ready('om-page-info', updateMenuByPageInfo);
  $script.ready(['om-state', 'om-page-info'], updateMenuByStateAndPageInfo);

  OmegaPopup.applyPageProfile = applyPageProfile;
  OmegaPopup.refreshPageInfo = refreshPageInfo;

  return;

  function getMessage(id, args) {
    return OmegaTargetPopup.getMessage(id, args);
  }

  function updateMenuByState() {
    var state = OmegaPopup.state;
    if (state.proxyNotControllable) {
      location.href = 'proxy_not_controllable.html';
      return;
    }
    addProfilesItems(state);
    $script.done('om-profile-items');
    bindLinkControls();
    renderCurrent();
  }

  function updateMenuByPageInfo() {
    var info = OmegaPopup.pageInfo;
    if (info && info.errorCount > 0) {
      document.querySelector('.om-reqinfo').classList.remove('om-hidden');
      var text = getMessage('popup_requestErrorCount', [info.errorCount]);
      document.querySelector('.om-reqinfo-text').textContent = text;
    }
  }

  function updateMenuByStateAndPageInfo() {
    var info = OmegaPopup.pageInfo;
    if (!info || !info.url) {
      hideSections();
      return;
    }
    renderPageSection();
  }

  function hideSections() {
    var section = document.getElementById('js-profiles-section');
    if (section) section.classList.add('om-hidden');
    var notice = document.getElementById('js-unavailable');
    if (notice) notice.classList.add('om-hidden');
    var link = document.getElementById('js-link-section');
    if (link) link.classList.add('om-hidden');
  }

  // The one rule this popup manages: the full hostname's own rule.
  function ownRule() {
    var info = OmegaPopup.pageInfo;
    if (!info || !info.host || !info.tempRuleHostProfileName) return null;
    return {key: info.host, profileName: info.tempRuleHostProfileName};
  }

  function matchedRule() {
    var info = OmegaPopup.pageInfo;
    return info && info.tempRuleMatch || null;
  }

  function validProfileName(name) {
    if (!name || name === 'system') return false;
    var state = OmegaPopup.state;
    return !!(state && state.availableProfiles &&
      state.availableProfiles['+' + name]);
  }

  // A system proxy or an external PAC does not go through the PAC script, so
  // no per-site rule can take effect. Show the reason instead of a dead list.
  function perSiteAvailable() {
    var state = OmegaPopup.state;
    var info = OmegaPopup.pageInfo;
    if (!state || !info || !info.host) return false;
    if (state.isSystemProfile) return false;
    if (state.showExternalProfile && state.externalProfile &&
        state.currentProfileName === '') return false;
    return validProfileName(state.currentProfileName);
  }

  // Seed from what the page actually uses: a wider rule still decides it, so
  // copying that profile keeps the route unchanged. Otherwise use the default.
  function seedProfile() {
    var match = matchedRule();
    var host = OmegaPopup.pageInfo && OmegaPopup.pageInfo.host;
    if (match && match.key !== host && validProfileName(match.profileName)) {
      return match.profileName;
    }
    var state = OmegaPopup.state;
    return state && validProfileName(state.currentProfileName) ?
      state.currentProfileName : null;
  }

  function renderPageSection() {
    if (perSiteAvailable() && !matchedRule()) {
      var seed = seedProfile();
      if (seed) writePageRoute(seed, false);
    }
    renderCurrent();
  }

  // Force set (2) never toggles. With linking on, each listed host gets its own
  // explicit rule; only the last write refreshes the page, so one click reloads
  // at most once. Seeding calls this with no host list and touches only this host.
  function writePageRoute(profileName, refresh, hosts) {
    var info = OmegaPopup.pageInfo;
    if (!info || !info.host || !profileName) return false;
    if (!OmegaPopup.addTempRule) return false;
    var targets = hosts && hosts.length ? hosts : [info.host];
    targets.forEach(function(host, i) {
      OmegaPopup.addTempRule(host, profileName, 2,
        !!refresh && i === targets.length - 1);
    });
    if (isWildcard() && info.domain) {
      info.tempRuleProfileName = profileName;
      info.tempRuleMatch = {key: info.domain, profileName: profileName};
    } else {
      info.tempRuleHostProfileName = profileName;
      info.tempRuleMatch = {key: info.host, profileName: profileName};
    }
    return true;
  }

  function applyPageProfile(profileName) {
    if (!validProfileName(profileName)) return;
    if (!writePageRoute(profileName, true, linkedTargets())) return;
    // Bound hosts follow this page's profile, so keep their chips in step.
    if (linkPref) {
      linkPref.manual.forEach(function(item) { item.profile = profileName; });
      saveLinkPref();
    }
    renderCurrent();
    renderLinkSection();
    // The optimistic rule in writePageRoute is what was just applied; a
    // follow-up read races the page reload and can show a stale profile.
  }

  function profileTitle(name) {
    if (!name) return '';
    var text = getMessage('profile_' + name) || name;
    return text.replace(/^\[|\]$/g, '');
  }

  // ---- Scope: this host, or the whole-domain wildcard ---------------------
  // The switch is a persisted per-host UI preference: it only chooses where
  // the next profile click writes, and never changes rules by itself. A host
  // added in the input is bound immediately to the profile now in effect.
  // Keyed by host, not the main domain, so sibling subdomains do not share the
  // switch or the bound-host chips while the UI calls it "this site".

  function linkKey() {
    var info = OmegaPopup.pageInfo;
    var host = info && info.host;
    return host ? LINK_PREF + ':' + host : null;
  }

  function loadLinkPref() {
    var key = linkKey();
    if (!key) return {wildcard: false, manual: []};
    try {
      var raw = globalThis.localStorage.getItem(key);
      var p = raw && JSON.parse(raw);
      if (p && Array.isArray(p.manual)) {
        return {
          // Migrate the earlier "联动" preference into wildcard mode.
          wildcard: !!(p.wildcard || p.enabled),
          manual: p.manual.map(function(item) {
            return typeof item === 'string' ? {host: item, profile: ''} : item;
          })
        };
      }
    } catch (_) {
    }
    return {wildcard: false, manual: []};
  }

  function saveLinkPref() {
    var key = linkKey();
    if (!key || !linkPref) return;
    try {
      globalThis.localStorage.setItem(key, JSON.stringify(linkPref));
    } catch (_) {
    }
  }

  function inDomain(host, domain) {
    return host === domain ||
      host.slice(-(domain.length + 1)) === '.' + domain;
  }

  function isWildcard() {
    return !!(linkPref && linkPref.wildcard);
  }

  // The profile actually in effect for this page, reported by the background.
  // Covers both a host rule and a wider domain rule.
  function currentRuleProfile() {
    var match = matchedRule();
    var info = OmegaPopup.pageInfo;
    if (match && info &&
        (match.key === info.host || match.key === info.domain)) {
      return match.profileName;
    }
    return null;
  }

  function linkedTargets() {
    var info = OmegaPopup.pageInfo;
    if (!info) return [];
    if (!linkPref) linkPref = loadLinkPref();
    var targets = [];
    // In whole-domain mode also write the current host with the same profile.
    // A lingering host rule would otherwise shadow the wildcard rule and the
    // page (and the check) would keep following the old profile.
    if (isWildcard() && info.domain) {
      targets = info.host ? [info.domain, info.host] : [info.domain];
    } else if (info.host) {
      targets = [info.host];
    }
    // Bound hosts exist to move together with this page. Write the new profile
    // to each of them too; even in wildcard mode they may hold an older host
    // rule that would shadow the freshly written domain rule.
    linkPref.manual.forEach(function(item) {
      if (targets.indexOf(item.host) === -1) targets.push(item.host);
    });
    return targets;
  }

  function renderLinkSection() {
    var section = document.getElementById('js-link-section');
    if (!section) return;
    var info = OmegaPopup.pageInfo;
    if (!perSiteAvailable() || !info || !info.domain) {
      section.classList.add('om-hidden');
      return;
    }
    section.classList.remove('om-hidden');
    if (!linkPref) linkPref = loadLinkPref();

    var toggle = document.getElementById('js-link-toggle');
    if (toggle) {
      toggle.setAttribute('aria-checked', isWildcard() ? 'true' : 'false');
      toggle.classList.toggle('om-switch-on', isWildcard());
      toggle.setAttribute('aria-label', getMessage('popup_scopeSwitch'));
      toggle.setAttribute('title', getMessage('popup_scopeSwitch'));
    }
    var scopeLabel = document.getElementById('js-scope-label');
    if (scopeLabel) {
      scopeLabel.textContent = getMessage(isWildcard() ?
        'popup_scopeDomain' : 'popup_scopeCurrent');
    }
    var scopeSub = document.getElementById('js-scope-sub');
    if (scopeSub) {
      scopeSub.textContent = getMessage(isWildcard() ?
        'popup_scopeDomainHint' : 'popup_scopeCurrentHint',
        [isWildcard() ? info.domain : info.host]);
    }

    var bindArea = document.getElementById('js-bind-area');
    if (bindArea) bindArea.classList.toggle('om-hidden', isWildcard());
    var input = document.getElementById('js-link-input');
    if (input) input.placeholder = getMessage('popup_bindPlaceholder');
    var add = document.getElementById('js-link-add');
    if (add) add.textContent = getMessage('popup_bindAdd');

    var list = document.getElementById('js-link-list');
    if (!list) return;
    list.textContent = '';
    if (!linkPref.manual.length) return;
    linkPref.manual.forEach(function(item) {
      var row = document.createElement('div');
      row.className = 'om-bind-chip';
      var name = document.createElement('span');
      name.className = 'om-bind-chip-host';
      name.textContent = item.host;
      var rule = document.createElement('span');
      rule.className = 'om-bind-chip-rule';
      rule.textContent = profileTitle(item.profile);
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'om-bind-chip-remove';
      remove.setAttribute('title', getMessage('popup_linkRemove'));
      remove.textContent = '\u00d7';
      remove.addEventListener('click', function(e) {
        e.stopPropagation();
        unbindHost(item.host);
      });
      row.appendChild(name);
      row.appendChild(rule);
      row.appendChild(remove);
      list.appendChild(row);
    });
  }

  function bindHost() {
    var input = document.getElementById('js-link-input');
    var info = OmegaPopup.pageInfo;
    var host = input && input.value && input.value.trim().toLowerCase();
    // Strip a scheme or trailing path so pasting a URL still works.
    if (host) host = host.replace(/^[a-z]+:\/\//, '').split('/')[0];
    if (!host || !info || !info.domain) return;
    if (host === info.host || host === info.domain ||
        !inDomain(host, info.domain)) return;
    if (!linkPref) linkPref = loadLinkPref();
    var profile = currentRuleProfile() ||
      (OmegaPopup.state && OmegaPopup.state.currentProfileName);
    if (!profile || !OmegaPopup.addTempRule) return;
    // Bind now: one action writes the rule, no second click needed.
    OmegaPopup.addTempRule(host, profile, 2, false);
    var found = false;
    linkPref.manual.forEach(function(item) {
      if (item.host === host) { item.profile = profile; found = true; }
    });
    if (!found) linkPref.manual.push({host: host, profile: profile});
    input.value = '';
    saveLinkPref();
    renderLinkSection();
  }

  function unbindHost(host) {
    if (!linkPref || !OmegaPopup.addTempRule) return;
    OmegaPopup.addTempRule(host, '', -1, false);
    linkPref.manual = linkPref.manual.filter(function(item) {
      return item.host !== host;
    });
    saveLinkPref();
    renderLinkSection();
  }

  function bindLinkControls() {
    var toggle = document.getElementById('js-link-toggle');
    if (toggle && !toggle.dataset.bound) {
      toggle.dataset.bound = '1';
      toggle.addEventListener('click', function() {
        if (!linkPref) linkPref = loadLinkPref();
        linkPref.wildcard = !isWildcard();
        saveLinkPref();
        renderCurrent();
        renderLinkSection();
      });
    }
    var add = document.getElementById('js-link-add');
    if (add && !add.dataset.bound) {
      add.dataset.bound = '1';
      add.addEventListener('click', bindHost);
    }
    var input = document.getElementById('js-link-input');
    if (input && !input.dataset.bound) {
      input.dataset.bound = '1';
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') bindHost();
      });
    }
  }

  function renderCurrent() {
    var state = OmegaPopup.state;
    var info = OmegaPopup.pageInfo;
    var available = perSiteAvailable();
    var section = document.getElementById('js-profiles-section');
    var notice = document.getElementById('js-unavailable');

    if (section) section.classList.toggle('om-hidden', !available);
    if (notice) {
      notice.classList.toggle('om-hidden', available);
      if (!available) {
        var text = document.getElementById('js-unavailable-text');
        if (text) text.textContent = getMessage(state && state.isSystemProfile ?
          'popup_currentSystem' : 'popup_currentExternal');
      }
    }
    if (!available) return;

    var caption = document.getElementById('js-profiles-caption');
    if (caption) {
      caption.textContent = getMessage('popup_currentProfilesFor',
        [(info && info.host) || '']);
    }

    // System proxy cannot live in a PAC script, and "Add condition" edits the
    // default profile's rules, which now belongs to the options page.
    var systemItem = document.getElementById('js-system');
    if (systemItem) systemItem.parentElement.classList.add('om-hidden');
    var addRuleItem = document.querySelector('.om-nav-addrule');
    if (addRuleItem) addRuleItem.classList.add('om-hidden');

    refreshActive();
  }

  function refreshActive() {
    var card = document.getElementById('js-profiles-card');
    if (!card) return;
    var activeName = currentRuleProfile();

    card.querySelectorAll('.om-nav-item[data-profile]').forEach(function(item) {
      item.classList.remove('om-selected');
      var mark = item.querySelector('.om-item-mark');
      if (mark) mark.remove();
    });
    if (!activeName) return;

    var activeItem = null;
    card.querySelectorAll('.om-nav-item[data-profile]').forEach(function(item) {
      if (item.getAttribute('data-profile') === activeName) activeItem = item;
    });
    if (activeItem) {
      activeItem.classList.add('om-selected');
      var check = document.createElement('span');
      check.className = 'om-item-mark glyphicon glyphicon-ok';
      activeItem.querySelector('a').appendChild(check);
    }
  }

  // A rule synced from another device may arrive while the popup is open.
  // Re-read pageInfo, but leave seeding to the first render so a pull can
  // never race a write.
  function refreshPageInfo() {
    if (typeof OmegaTargetPopup === 'undefined' ||
        !OmegaTargetPopup.getActivePageInfo) return;
    var token = ++pageInfoToken;
    OmegaTargetPopup.getActivePageInfo(function(err, info) {
      if (token !== pageInfoToken) return;
      if (err || !info || !info.host) return;
      if (OmegaPopup.pageInfo && info.host !== OmegaPopup.pageInfo.host) return;
      OmegaPopup.pageInfo = info;
      renderCurrent();
      renderLinkSection();
    });
  }

  function compareProfile(a, b) {
    var diff;
    diff = (orderForType[a.profileType] | 0) - (orderForType[b.profileType] | 0);
    if (diff !== 0) {
      return diff;
    }
    if (a.name === b.name) {
      return 0;
    } else if (a.name < b.name) {
      return -1;
    } else {
      return 1;
    }
  }

  function addProfilesItems(state) {
    var directProfileDisp = document.getElementById('js-direct');
    var directProfile = state.availableProfiles['+direct'];
    directProfileDisp.parentElement.setAttribute('data-profile', 'direct');
    if (directProfile) {
      directProfileDisp.setAttribute('title', directProfile.desc || '');
    }

    var card = document.getElementById('js-profiles-card');
    var addRuleItem = card.querySelector('.om-nav-addrule');
    var profileCount = 0;
    var charCodeUnderscore = '_'.charCodeAt(0);
    var profiles = Object.keys(state.availableProfiles).map(function(key) {
      return state.availableProfiles[key];
    }).sort(compareProfile);
    profiles.forEach(function(profile) {
      if (profile.builtin) return;
      if (profile.name.charCodeAt(0) === charCodeUnderscore) return;
      profileCount++;

      var profileDisp = createMenuItemForProfile(profile,
        state.availableProfiles);
      profileDisp.setAttribute('data-profile', profile.name);
      var link = profileDisp.querySelector('a');
      link.id = 'js-profile-' + profileCount;
      link.addEventListener('click', function() {
        $script.ready('om-main', function() {
          OmegaPopup.chooseProfile(profile.name);
        });
      });
      card.insertBefore(profileDisp, addRuleItem);
    });
  }

  function createMenuItemForProfile(profile, profiles) {
    var profileDisp = profileTemplate.cloneNode(true);
    var text = getMessage('profile_' + profile.name) || profile.name;
    if (profile.defaultProfileName) {
      text += ' [' + profile.defaultProfileName + ']';
    }
    profileDisp.querySelector('.om-profile-name').textContent = text;

    var targetProfile = profile;
    if (profile.profileType === 'VirtualProfile') {
      targetProfile = profiles['+' + profile.defaultProfileName];
    }

    profileDisp.setAttribute('title',
      targetProfile.desc || targetProfile.name || '');

    var iconClass = iconForProfileType[targetProfile.profileType];
    var icon = profileDisp.querySelector('.glyphicon');
    icon.setAttribute('class', 'glyphicon ' + iconClass);
    // The built-in colours are fixed (#000, #aaa) and disappear on a dark
    // palette, so these two icons take their colour from the theme instead.
    if (targetProfile.color) icon.style.backgroundColor = targetProfile.color;
    if (targetProfile !== profile) {
      icon.classList.add('om-virtual-profile-icon');
    }
    return profileDisp;
  }
})();
