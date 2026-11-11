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

  // 'global': the list applies to every tab. 'page': the site in the header has
  // its own rule. The rule is the state: a host with a rule opens on 'page',
  // without one it follows the global profile. Keeping a separate mode
  // preference would let the popup claim a mode the routing does not have.
  OmegaPopup.mode = 'global';
  // What the site used in page mode. Switching back to global removes the
  // rule; this is what switching to page again restores.
  var PROFILE_PREF = 'omega.popup.pageProfile';
  // Guards a page-info refresh against an older answer overwriting a newer
  // switch. Declared up here because the body below the early return never
  // runs, so an initializer down there would leave it NaN.
  var pageInfoToken = 0;

  $script.ready('om-state', updateMenuByState);
  $script.ready('om-page-info', updateMenuByPageInfo);
  $script.ready(['om-state', 'om-page-info'], updateMenuByStateAndPageInfo);

  OmegaPopup.applyPageProfile = applyPageProfile;

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
    updateOtherItems(state);
    bindModeToggle();
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

  function updateMenuByPageInfo() {
    var info = OmegaPopup.pageInfo;
    if (info && info.errorCount > 0) {
      document.querySelector('.om-reqinfo').classList.remove('om-hidden');
      var text = getMessage('popup_requestErrorCount', [info.errorCount]);
      document.querySelector('.om-reqinfo-text').textContent = text;
    }
  }

  function updateMenuByStateAndPageInfo() {
    var state = OmegaPopup.state;
    var info = OmegaPopup.pageInfo;
    if (state.showExternalProfile && state.externalProfile &&
        (!info || !info.errorCount)) {
      showMenuForExternalProfile(state);
    }
    if (!info || !info.url) {
      document.getElementById('js-page-header').classList.add('om-hidden');
      return updateOtherItems(null);
    }
    renderPageSection(info);
  }

  function renderPageSection(info) {
    document.getElementById('js-page-header').classList.remove('om-hidden');
    document.getElementById('js-page-header')
      .setAttribute('title', info.url || '');

    // A site with its own rule is on the page view; one without it follows the
    // global profile. The rule is synced, so a rule added on another device
    // opens here on the page view too.
    OmegaPopup.mode = (pageModeAvailable() && hostRule()) ? 'page' : 'global';
    applyMode();
  }

  function loadPref(base) {
    var key = prefKey(base);
    if (!key) return null;
    try {
      return globalThis.localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function savePref(base, value) {
    var key = prefKey(base);
    if (!key) return;
    try {
      globalThis.localStorage.setItem(key, value);
    } catch (_) {
    }
  }

  function prefKey(base) {
    var info = OmegaPopup.pageInfo;
    var host = info && (info.host || info.domain);
    return host ? base + ':' + host : null;
  }

  // The site's own rule. Page rules are keyed by the full hostname, so this is
  // the only scope the popup manages; a rule for a parent domain made before
  // the popup only wrote host rules is reported but never edited here.
  function hostRule() {
    var info = OmegaPopup.pageInfo;
    if (!info || !info.host || !info.tempRuleHostProfileName) return null;
    return {key: info.host, profileName: info.tempRuleHostProfileName};
  }

  // The rule the PAC script actually applies to this host, as the background
  // reported it. It can also be a wider rule, such as one for the whole domain.
  function matchedRule() {
    var info = OmegaPopup.pageInfo;
    return info && info.tempRuleMatch || null;
  }

  function otherRule() {
    var match = matchedRule();
    var host = OmegaPopup.pageInfo && OmegaPopup.pageInfo.host;
    if (!match || match.key === host) return null;
    return match;
  }

  function lastPageProfile() {
    var name = loadPref(PROFILE_PREF);
    var state = OmegaPopup.state;
    if (!name || name === 'system') return null;
    if (state && state.availableProfiles &&
        !state.availableProfiles['+' + name]) return null;
    return name;
  }

  // Switching to page applies what this site used last, else the profile it is
  // using right now, so the switch alone changes nothing until the user picks
  // something else. The choice is real: it is written as the site's rule.
  function defaultPageProfile() {
    var remembered = lastPageProfile();
    if (remembered) return remembered;
    var state = OmegaPopup.state;
    var name = state && state.currentProfileName;
    if (!name || name === 'system') return 'direct';
    if (state.availableProfiles && !state.availableProfiles['+' + name]) {
      return 'direct';
    }
    return name;
  }

  // Keep the pageInfo copy in step with what was just written, so the header
  // and the check follow without waiting for the background to answer again.
  function rememberRule(profileName) {
    var info = OmegaPopup.pageInfo;
    if (!info) return;
    info.tempRuleHostProfileName = profileName;
    if (profileName) {
      info.tempRuleMatch = {key: info.host, profileName: profileName};
    } else if (info.tempRuleMatch && info.tempRuleMatch.key === info.host) {
      info.tempRuleMatch = null;
    }
  }

  function pageModeAvailable() {
    var state = OmegaPopup.state;
    var info = OmegaPopup.pageInfo;
    return !!(state && info && info.host && !state.isSystemProfile &&
      state.currentProfileName && state.validResultProfiles &&
      state.validResultProfiles.length);
  }

  // Write the site's own rule. Anything wider — a domain rule made before the
  // popup only wrote host rules — is left exactly as it was: editing it here
  // would reroute every other site that relies on it.
  function writePageRoute(profileName) {
    var info = OmegaPopup.pageInfo;
    if (!info || !info.host || !profileName) return false;
    var existing = hostRule();
    // addTempRule toggles, so it is only called when the rule is missing or
    // points elsewhere; calling it with the same profile would remove it.
    if (!existing || existing.profileName !== profileName) {
      if (!OmegaPopup.addTempRule) return false;
      OmegaPopup.addTempRule(info.host, profileName);
    }
    savePref(PROFILE_PREF, profileName);
    rememberRule(profileName);
    return true;
  }

  function bindModeToggle() {
    var toggle = document.getElementById('js-mode-toggle');
    if (!toggle) return;
    toggle.addEventListener('click', function() {
      setMode(OmegaPopup.mode === 'page' ? 'global' : 'page');
    });
  }

  // The mode switch is the state switch: page writes (or restores) the site's
  // rule, global removes it. It only ever touches this site's own key.
  function setMode(mode) {
    if (mode === 'page' && !pageModeAvailable()) return;
    if (mode === OmegaPopup.mode) return;
    if (mode === 'page') {
      var profileName = defaultPageProfile();
      if (!profileName) return;
      if (!writePageRoute(profileName)) return;
    } else {
      var rule = hostRule();
      if (rule) {
        if (!OmegaPopup.clearTempRule) return;
        OmegaPopup.clearTempRule(rule.key, rule.profileName);
      }
      rememberRule(null);
    }
    OmegaPopup.mode = mode;
    applyMode();
    refreshPageInfo();
  }

  function applyMode() {
    var mode = OmegaPopup.mode;
    var available = pageModeAvailable();
    var pageMode = mode === 'page';
    var toggle = document.getElementById('js-mode-toggle');
    var title = document.getElementById('js-page-host');
    var subtitle = document.getElementById('js-page-sub');
    var caption = document.getElementById('js-profiles-caption');
    var info = OmegaPopup.pageInfo;

    if (toggle) {
      var toggleLabel = document.getElementById('js-mode-toggle-label');
      if (toggleLabel) {
        toggleLabel.textContent = getMessage(pageMode ?
          'popup_modePage' : 'popup_modeGlobal');
      }
      toggle.disabled = !available;
      toggle.setAttribute('aria-pressed', pageMode ? 'true' : 'false');
      toggle.classList.toggle('om-switch-on', pageMode);
      toggle.classList.toggle('om-disabled', !available);
      // With a system proxy as the global profile there is no page route to
      // choose, so the control is left out instead of being a dead chip.
      toggle.classList.toggle('om-hidden', !available);
      toggle.setAttribute('title', getMessage(available ?
        'popup_modeHelp' : 'popup_tempRuleUnavailableHelp'));
    }

    if (title) title.textContent = (info && info.host) || '';

    if (subtitle) subtitle.textContent = subtitleText();

    var note = document.getElementById('js-inherited');
    if (note) renderInherited(note);

    if (caption) {
      caption.textContent = pageMode ?
        getMessage('popup_pageProfilesFor', [(info && info.host) || '']) :
        getMessage('popup_globalProfiles');
    }

    refreshActive();
  }

  function profileTitle(name) {
    if (!name) return '';
    var text = getMessage('profile_' + name) || name;
    return text.replace(/^\[|\]$/g, '');
  }

  // What the browser is actually doing for this page: page mode names the
  // site's own rule, global mode names the global profile. A wider rule that
  // still decides the page is reported by the hint row below.
  function subtitleText() {
    var state = OmegaPopup.state;
    if (OmegaPopup.mode === 'page') {
      var rule = hostRule();
      return getMessage('popup_pageUsing', [profileTitle(rule && rule.profileName)]);
    }
    if (!state) return '';
    return getMessage('popup_globalUsing', [globalRouteName(state)]);
  }

  function globalRouteName(state) {
    if (!state) return '';
    if (!state.currentProfileName) return getMessage('popup_externalProfile');
    if (state.isSystemProfile) return profileTitle('system');
    return profileTitle(state.currentProfileName);
  }

  // A rule wider than this site still decides it: a domain rule made before
  // the popup only wrote host rules. It is reported, never edited here:
  // changing it would reroute every other site that relies on it. The explicit
  // button is the only way to drop one.
  function renderInherited(note) {
    var rule = otherRule();
    note.classList.toggle('om-hidden', !rule);
    if (!rule) return;
    note.querySelector('.om-inherited-text').textContent =
      getMessage('popup_domainOverride', [profileTitle(rule.profileName),
        rule.key]);
    var button = note.querySelector('.om-inherited-clear');
    button.textContent = getMessage('popup_domainOverrideClear');
    if (button.dataset.bound) return;
    button.dataset.bound = '1';
    button.addEventListener('click', function() {
      var current = otherRule();
      if (!current || !OmegaPopup.clearTempRule) return;
      OmegaPopup.clearTempRule(current.key, current.profileName);
      rememberRule(null);
      applyMode();
      refreshPageInfo();
    });
  }

  function refreshActive() {
    var state = OmegaPopup.state;
    if (!state) return;
    var card = document.getElementById('js-profiles-card');
    if (!card) return;
    var pageMode = OmegaPopup.mode === 'page';
    var activeName = activeProfileName(state, pageMode);

    card.querySelectorAll('.om-nav-item[data-profile]').forEach(function(item) {
      item.classList.remove('om-selected');
      var mark = item.querySelector('.om-item-mark');
      if (mark) mark.remove();
    });

    // The chevron edits the switch profile's default result, which is a global
    // change; in page mode it would silently mix the two scopes again.
    card.classList.toggle('om-page-mode', pageMode);

    // The system proxy cannot ride inside a PAC script, so it is not offered
    // as a page route at all instead of being shown disabled.
    var systemItem = document.getElementById('js-system').parentElement;
    systemItem.classList.toggle('om-hidden', pageMode);

    // "Add condition" edits the global profile's rules, not the page route,
    // so it is only offered while the list is about the global profile.
    var addRuleItem = document.querySelector('.om-nav-addrule');
    addRuleItem.classList.toggle('om-hidden',
      pageMode || !OmegaPopup.showAddRule);

    if (activeName == null) return;
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

  // In global mode an imported external profile takes over the system row, so
  // it is the external row that is marked as in effect. In page mode the check
  // is the site's own rule; a wider rule that still decides the page is
  // reported by the hint row instead.
  function activeProfileName(state, pageMode) {
    if (pageMode) {
      var rule = hostRule();
      return rule ? rule.profileName : null;
    }
    if (state.showExternalProfile && state.externalProfile &&
        state.currentProfileName === '') {
      return '';
    }
    return state.isSystemProfile ? 'system' : state.currentProfileName;
  }

  // A click applies that profile as the site's own rule, and nothing else. It
  // is idempotent: re-applying the profile that is already there changes
  // nothing. Going back to global is the mode switch, so a click never
  // deletes anything.
  function applyPageProfile(profileName) {
    if (profileName === 'system') return;
    if (!writePageRoute(profileName)) return;
    applyMode();
    refreshPageInfo();
  }

  // Ask the background for the route again after a write or delete. The rule
  // map is updated synchronously before the background answers the next
  // message, so this also picks up a wider rule the site falls back to.
  function refreshPageInfo() {
    if (typeof OmegaTargetPopup === 'undefined' ||
        !OmegaTargetPopup.getActivePageInfo) return;
    var token = ++pageInfoToken;
    OmegaTargetPopup.getActivePageInfo(function(err, info) {
      if (token !== pageInfoToken) return;
      if (err || !info || !info.host) return;
      if (OmegaPopup.pageInfo && info.host !== OmegaPopup.pageInfo.host) return;
      OmegaPopup.pageInfo = info;
      OmegaPopup.mode = (pageModeAvailable() && hostRule()) ? 'page' : 'global';
      applyMode();
    });
  }

  function showMenuForExternalProfile(state) {
    var profile = state.externalProfile;
    profile.name = getMessage('popup_externalProfile');
    var profileDisp = createMenuItemForProfile(profile);
    // The empty name identifies the external row; refreshActive marks it when
    // the browser is controlled by an imported profile.
    profileDisp.setAttribute('data-profile', '');

    var link = profileDisp.querySelector('a');
    link.id = 'js-external';
    link.addEventListener('click', function() {
      location.href = '../popup.html#!external';
    });

    var card = document.getElementById('js-profiles-card');
    card.insertBefore(profileDisp, card.querySelector('.om-nav-addrule'));
    applyMode();
  }

  function updateOtherItems(state) {
    var hasValidResults = state && state.validResultProfiles &&
      state.validResultProfiles.length;
    OmegaPopup.showAddRule = !!(hasValidResults &&
      state.currentProfileCanAddRule);
    if (!OmegaPopup.showAddRule) document.getElementById('js-addrule').href = '#';
    applyMode();
  }

  function addProfilesItems(state) {
    var systemProfileDisp = document.getElementById('js-system');
    var directProfileDisp = document.getElementById('js-direct');
    var systemProfile = state.availableProfiles['+system'];
    var directProfile = state.availableProfiles['+direct'];
    directProfileDisp.parentElement.setAttribute('data-profile', 'direct');
    systemProfileDisp.parentElement.setAttribute('data-profile', 'system');
    // The built-in colours are fixed (#000, #aaa) and disappear on a dark
    // palette, so these two icons take their colour from the theme instead.
    systemProfileDisp.setAttribute('title', systemProfile.desc);
    directProfileDisp.setAttribute('title', directProfile.desc);

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

      if (profile.validResultProfiles) {
        profileDisp.classList.add('om-has-dropdown');
        link.classList.add('om-has-edit');
        var toggle = document.createElement('div');
        toggle.classList.add('om-edit-toggle');
        var icon = document.createElement('span');
        icon.setAttribute('class', 'glyphicon glyphicon-chevron-down');
        toggle.appendChild(icon);

        toggle.addEventListener('click', function(e) {
          e.stopPropagation();
          e.preventDefault();
          toggleDropdown(profileDisp,
            createDefaultProfileDropdown.bind(profileDisp, profile));
        });

        link.appendChild(toggle);
      }

      card.insertBefore(profileDisp, addRuleItem);
    });
  }

  function createMenuItemForProfile(profile, profiles) {
    var profileDisp = profileTemplate.cloneNode(true);
    var text = getMessage('profile_' + profile.name) ||
      profile.name;
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
    // The colour fills the rounded tile and the glyph stays white, the way an
    // iOS settings row carries its icon. A missing colour keeps the neutral tile.
    if (targetProfile.color) icon.style.backgroundColor = targetProfile.color;
    if (targetProfile !== profile) {
      icon.classList.add('om-virtual-profile-icon');
    }
    return profileDisp;
  }

  function toggleDropdown(container, createDropdown) {
    if (!container.classList.contains('om-dropdown-loaded')) {
      var dropdown = createDropdown();
      dropdown.classList.add('om-dropdown');
      container.appendChild(dropdown);
      container.classList.add('om-dropdown-loaded');
    }
    if (container.classList.contains('om-open')) {
      container.classList.remove('om-open');
    } else {
      container.classList.add('om-open');
    }
  }

  function createDefaultProfileDropdown(profile) {
    var ul = document.createElement('ul');
    var state = OmegaPopup.state;
    var profiles = profile.validResultProfiles.map(function(name) {
      return state.availableProfiles['+' + name];
    }).sort(compareProfile);
    profiles.forEach(function(resultProfile) {
      if (resultProfile.name.indexOf('__') === 0) return;
      if ((resultProfile.name === profile.currentProfileName) &&
        (profile.validResultProfiles.length > 1)
      ) return;
      var li = createMenuItemForProfile(resultProfile, state.availableProfiles);
      var link = li.querySelector('a');
      link.addEventListener('click', function() {
        $script.ready('om-main', function() {
          OmegaPopup.setDefaultProfile(profile.name, resultProfile.name);
        });
      });
      if (resultProfile.name === profile.currentProfileName) {
        li.classList.add('om-selected');
      }
      ul.appendChild(li);
    });
    return ul;
  }
})();
