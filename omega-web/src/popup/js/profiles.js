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

  // 'global': the list applies to every tab. 'page': the list applies to the
  // site shown in the header only, as a temp rule.
  OmegaPopup.mode = 'global';
  // The mode and the scope decide what the next click edits, not what the page
  // is routed to, so they are kept as a per-site preference: a reopened popup
  // still shows the list the user was working in instead of starting over on
  // the global one, while another site keeps its own choice.
  var MODE_PREF = 'omega.popup.mode';
  var SCOPE_PREF = 'omega.popup.scope';
  OmegaPopup.pageScopes = [];
  OmegaPopup.pageScope = null;
  // One route for the page, no matter which scope it is written to, so that
  // switching between subdomain and domain keeps the chosen profile.
  OmegaPopup.pageRoute = null;

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
    bindClearRule();
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

    OmegaPopup.pageScopes = pageScopes(info);
    // Only a rule written for this host is "this page". A rule for the
    // registrable domain covers every subdomain of it, so it must not be
    // presented (or rewritten) as this page's own route.
    OmegaPopup.pageRoute = pageRouteFromInfo(info);
    OmegaPopup.pageScope = restoredScope();
    renderScope();

    OmegaPopup.mode = restoredMode();
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

  // A stored scope is only honoured while the page still has it; otherwise the
  // scope owning the page's own rule is the next best answer, then the most
  // specific one.
  function restoredScope() {
    var scopes = OmegaPopup.pageScopes || [];
    var kind = loadPref(SCOPE_PREF);
    var scope = scopes.filter(function(s) { return s.kind === kind; })[0];
    if (scope) return scope;
    var route = OmegaPopup.pageRoute;
    if (route) {
      scope = scopes.filter(function(s) { return s.key === route.key; })[0];
      if (scope) return scope;
    }
    return scopes[0] || null;
  }

  function restoredMode() {
    var mode = loadPref(MODE_PREF);
    if (mode === 'page' && pageModeAvailable()) return 'page';
    if (mode === 'global') return 'global';
    // Nothing stored yet: a page that already has its own route opens on it.
    return OmegaPopup.pageRoute && pageModeAvailable() ? 'page' : 'global';
  }

  function pageScopes(info) {
    var scopes = [];
    if (!info || !info.url) return scopes;
    if (info.host && info.domain && info.host !== info.domain) {
      scopes.push({key: info.host, kind: 'host'});
    }
    if (info.domain) {
      scopes.push({key: info.domain, kind: 'domain'});
    }
    return scopes;
  }

  function ruleForKey(key) {
    var info = OmegaPopup.pageInfo;
    if (!info || !key) return null;
    if (info.host && key === info.host && key !== info.domain &&
        info.tempRuleHostProfileName) {
      return {key: key, profileName: info.tempRuleHostProfileName};
    }
    if (key === info.domain && info.tempRuleProfileName) {
      return {key: key, profileName: info.tempRuleProfileName};
    }
    return null;
  }

  function pageRouteFromInfo(info) {
    if (!info) return null;
    // A bare host is its own domain, so the one rule it can have is the page.
    if (info.host && info.host === info.domain) return ruleForKey(info.domain);
    return ruleForKey(info.host);
  }

  // The rule a wider scope already carries. Shown, never edited from here:
  // changing it would reroute every other subdomain that relies on it.
  function inheritedRule() {
    var info = OmegaPopup.pageInfo;
    var scope = OmegaPopup.pageScope;
    if (!info || !scope || scope.kind !== 'host') return null;
    if (!info.tempRuleProfileName) return null;
    return {key: info.domain, profileName: info.tempRuleProfileName};
  }

  // The rule that decides this page right now: its own temp rule, or the rule
  // of the wider scope it inherits. Marks the profile in effect, so a subdomain
  // that only inherits a domain rule no longer looks like it has no route.
  function effectivePageRule() {
    var scope = OmegaPopup.pageScope;
    return ruleForKey(scope && scope.key) || inheritedRule();
  }

  // Keep the pageInfo copy in step with what was just written, so a second
  // click on the same row (and a later scope switch) sees the new state
  // without waiting for the background to answer again.
  function rememberRule(key, profileName) {
    var info = OmegaPopup.pageInfo;
    if (!info) return;
    if (info.host && key === info.host && key !== info.domain) {
      info.tempRuleHostProfileName = profileName;
    }
    if (key === info.domain) info.tempRuleProfileName = profileName;
  }

  function pageModeAvailable() {
    var state = OmegaPopup.state;
    return !!(state && state.validResultProfiles &&
      state.validResultProfiles.length &&
      OmegaPopup.pageScopes && OmegaPopup.pageScopes.length);
  }

  // Scope labels are the domain names themselves: the subdomain shows the
  // full host, the domain shows the registrable domain. One segmented control,
  // only when the host really is a subdomain.
  function renderScope() {
    var row = document.getElementById('js-scope');
    var scopes = OmegaPopup.pageScopes;
    if (!row) return;
    row.textContent = '';
    if (!scopes || scopes.length < 2) return;

    var segmented = document.createElement('span');
    segmented.className = 'om-segmented';
    segmented.setAttribute('role', 'group');
    segmented.setAttribute('aria-label', getMessage('popup_tempRuleScope'));
    scopes.forEach(function(scope) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'om-segmented-btn';
      button.textContent = scope.key;
      button.setAttribute('title', scope.key);
      button.addEventListener('click', function() {
        setPageScope(scope);
      });
      scope.button = button;
      segmented.appendChild(button);
    });
    row.appendChild(segmented);
    updateScopeSelection();
  }

  function updateScopeSelection() {
    var current = OmegaPopup.pageScope;
    (OmegaPopup.pageScopes || []).forEach(function(scope) {
      if (!scope.button) return;
      var selected = scope === current;
      scope.button.classList.toggle('om-segmented-selected', selected);
      scope.button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }

  function setPageScope(scope) {
    if (!scope || OmegaPopup.pageScope === scope) return;
    // Scope only chooses where the next click writes. It never moves or
    // deletes a rule: the other scope may be what another site relies on.
    OmegaPopup.pageScope = scope;
    savePref(SCOPE_PREF, scope.kind);
    updateScopeSelection();
    applyMode();
  }

  // Write exactly one rule, the one for the scope that was clicked. Every
  // other temp rule — including a domain rule that other subdomains inherit —
  // is left exactly as it was.
  function writePageRoute(key, profileName) {
    var existing = ruleForKey(key);
    // addTempRule toggles, so it is only called when the rule is missing or
    // points elsewhere; calling it with the same profile would remove it.
    if (!existing || existing.profileName !== profileName) {
      if (OmegaPopup.addTempRule) OmegaPopup.addTempRule(key, profileName);
    }
    rememberRule(key, profileName);
    if (OmegaPopup.pageScope && OmegaPopup.pageScope.key === key) {
      OmegaPopup.pageRoute = {key: key, profileName: profileName};
    }
  }

  // Remove the one rule the current scope is showing. A click never reaches
  // a rule of another scope.
  function clearCurrentScopeRule() {
    var scope = OmegaPopup.pageScope;
    var rule = scope && ruleForKey(scope.key);
    if (!rule) return;
    if (OmegaPopup.clearTempRule) {
      OmegaPopup.clearTempRule(rule.key, rule.profileName);
    }
    rememberRule(rule.key, null);
    OmegaPopup.pageRoute = null;
  }

  function bindModeToggle() {
    var toggle = document.getElementById('js-mode-toggle');
    if (!toggle) return;
    toggle.addEventListener('click', function() {
      setMode(OmegaPopup.mode === 'page' ? 'global' : 'page');
    });
  }

  // The one explicit way back from a temp rule. It is offered in the list
  // heading while the shown scope has a rule of its own, so applying a profile
  // never doubles as a deletion.
  function bindClearRule() {
    var button = document.getElementById('js-clear-rule');
    if (!button) return;
    button.addEventListener('click', function() {
      clearCurrentScopeRule();
      applyMode();
    });
  }

  // The toggle only changes which list is shown. It never writes or deletes a
  // temp rule: dropping one here used to take a route away from other sites
  // that were still using it.
  function setMode(mode) {
    if (mode === 'page' && !pageModeAvailable()) return;
    if (mode === OmegaPopup.mode) return;
    OmegaPopup.mode = mode;
    savePref(MODE_PREF, mode);
    applyMode();
  }

  function applyMode() {
    var mode = OmegaPopup.mode;
    var available = pageModeAvailable();
    var pageMode = mode === 'page';
    var toggle = document.getElementById('js-mode-toggle');
    var scopeRow = document.getElementById('js-scope');
    var title = document.getElementById('js-page-host');
    var subtitle = document.getElementById('js-page-sub');
    var caption = document.getElementById('js-profiles-caption');
    var info = OmegaPopup.pageInfo;
    var scope = OmegaPopup.pageScope;

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

    if (title) {
      var showDomain = pageMode && scope && scope.kind === 'domain';
      title.textContent = showDomain ? scope.key :
        (info && (info.host || info.domain)) || '';
    }

    if (subtitle) subtitle.textContent = subtitleText();

    var note = document.getElementById('js-inherited');
    if (note) renderInherited(note);

    if (caption) {
      caption.textContent = pageMode && scope ?
        getMessage('popup_pageProfilesFor', [scope.key]) :
        getMessage('popup_globalProfiles');
    }

    var clearButton = document.getElementById('js-clear-rule');
    if (clearButton) {
      var ownRule = pageMode && ruleForKey(scope && scope.key);
      clearButton.classList.toggle('om-hidden', !ownRule);
      clearButton.textContent = getMessage(scope && scope.kind === 'domain' ?
        'popup_clearDomainRule' : 'popup_clearPageRule');
      clearButton.setAttribute('title', getMessage('popup_tempRuleLifetime'));
    }

    if (scopeRow) {
      var showScope = pageMode && scope &&
        scopeRow.querySelector('.om-segmented');
      scopeRow.classList.toggle('om-hidden', !showScope);
    }

    refreshActive();
  }

  function profileTitle(name) {
    if (!name) return '';
    var text = getMessage('profile_' + name) || name;
    return text.replace(/^\[|\]$/g, '');
  }

  // What the browser is actually doing for this page: with no temp rule in
  // effect the page simply follows the global profile, so say that instead of
  // leaving the header with instructions when nothing has been chosen yet.
  function subtitleText() {
    var state = OmegaPopup.state;
    if (OmegaPopup.mode === 'page') {
      var route = effectivePageRule();
      return route ?
        getMessage('popup_pageUsing', [profileTitle(route.profileName)]) :
        getMessage('popup_pageFollowGlobal', [globalRouteName(state)]);
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

  // A domain-wide temp rule still decides this host, but it also decides
  // every sibling. Say so in both views, and offer the one explicit way to
  // drop it: the page list marks the profile it gives this host, but a click
  // there writes this host's own rule instead of touching the domain one.
  function renderInherited(note) {
    var rule = inheritedRule();
    note.classList.toggle('om-hidden', !rule);
    if (!rule) return;
    note.querySelector('.om-inherited-text').textContent =
      getMessage('popup_domainOverride',
        [profileTitle(rule.profileName), rule.key]);
    var button = note.querySelector('.om-inherited-clear');
    button.textContent = getMessage('popup_domainOverrideClear');
    if (button.dataset.bound) return;
    button.dataset.bound = '1';
    button.addEventListener('click', function() {
      var current = inheritedRule();
      if (!current || !OmegaPopup.clearTempRule) return;
      OmegaPopup.clearTempRule(current.key, current.profileName);
      rememberRule(current.key, null);
      applyMode();
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
  // it is the external row that is marked as in effect.
  function activeProfileName(state, pageMode) {
    if (pageMode) {
      var rule = effectivePageRule();
      return rule && rule.profileName;
    }
    if (state.showExternalProfile && state.externalProfile &&
        state.currentProfileName === '') {
      return '';
    }
    return state.isSystemProfile ? 'system' : state.currentProfileName;
  }

  // A click applies that profile to the scope currently shown, and nothing
  // else. It is idempotent: re-applying the profile that is already there
  // changes nothing. Removing a temp rule has its own button in the list
  // heading, because a row that silently deleted a rule on the second click
  // made an applied route look like it had never been saved.
  function applyPageProfile(profileName) {
    var scope = OmegaPopup.pageScope;
    if (!scope || profileName === 'system') return;
    writePageRoute(scope.key, profileName);
    applyMode();
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
