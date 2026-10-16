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

  // 'global': the list picks the profile for every tab.
  // 'page': the same list picks a temp rule for this host (or its domain).
  OmegaPopup.mode = 'global';
  OmegaPopup.pageScope = null;
  OmegaPopup.pageScopes = [];

  $script.ready('om-state', updateMenuByState);
  $script.ready('om-page-info', updateMenuByPageInfo);
  $script.ready(['om-state', 'om-page-info'], updateMenuByStateAndPageInfo);

  OmegaPopup.clearPageTempRules = clearPageTempRules;
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
    bindModeButtons();
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
      var text = getMessage('popup_requestErrorCount',
        [info.errorCount]);
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
    if (!info || !info.url) return updateOtherItems(null);
    renderPageSection(info);
  }

  function renderPageSection(info) {
    var section = document.getElementById('js-page-section');
    section.classList.remove('om-hidden');
    var hostText = document.getElementById('js-page-host');
    hostText.textContent = info.host || info.domain;
    hostText.parentElement.setAttribute('title', info.url || '');

    var rule = tempRuleForPage(info);
    OmegaPopup.pageScopes = pageScopes(info);
    OmegaPopup.pageScope = OmegaPopup.pageScopes[0] || null;
    if (rule) {
      OmegaPopup.pageScopes.forEach(function(scopeItem) {
        if (scopeItem.key === rule.key) OmegaPopup.pageScope = scopeItem;
      });
    }
    renderScope();

    // Opening the popup on a page that already has a temp rule lands on
    // "current", so the highlighted row is the one actually in effect.
    if (rule && pageModeAvailable()) OmegaPopup.mode = 'page';
    applyMode();
  }

  function pageScopes(info) {
    var scopes = [];
    if (!info || !info.url) return scopes;
    if (info.host && info.domain && info.host !== info.domain) {
      scopes.push({
        key: info.host,
        profileName: info.tempRuleHostProfileName || null,
        labelId: 'popup_tempRuleScopeSubdomain',
      });
    }
    if (info.domain) {
      scopes.push({
        key: info.domain,
        profileName: info.tempRuleProfileName || null,
        labelId: 'popup_tempRuleScopeDomain',
      });
    }
    return scopes;
  }

  function tempRuleForPage(info) {
    if (!info) return null;
    if (info.host && info.host !== info.domain && info.tempRuleHostProfileName) {
      return {key: info.host, profileName: info.tempRuleHostProfileName};
    }
    if (info.tempRuleProfileName) {
      return {key: info.domain, profileName: info.tempRuleProfileName};
    }
    return null;
  }

  function pageModeAvailable() {
    var state = OmegaPopup.state;
    return !!(state && state.validResultProfiles &&
      state.validResultProfiles.length);
  }

  // The scope row only exists in page mode, and only when the host is a
  // subdomain of the registrable domain (otherwise there is nothing to pick).
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
    scopes.forEach(function(scopeItem) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'om-segmented-btn';
      button.textContent = getMessage(scopeItem.labelId);
      button.setAttribute('title', scopeItem.key);
      button.addEventListener('click', function() {
        if (OmegaPopup.pageScope === scopeItem) return;
        OmegaPopup.pageScope = scopeItem;
        updateScopeSelection();
        refreshActive();
      });
      scopeItem.button = button;
      segmented.appendChild(button);
    });
    row.appendChild(segmented);
    updateScopeSelection();
  }

  function updateScopeSelection() {
    var current = OmegaPopup.pageScope;
    (OmegaPopup.pageScopes || []).forEach(function(scopeItem) {
      if (!scopeItem.button) return;
      var selected = scopeItem === current;
      scopeItem.button.classList.toggle('om-scope-selected', selected);
      scopeItem.button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }

  function bindModeButtons() {
    var globalBtn = document.getElementById('js-mode-global');
    var pageBtn = document.getElementById('js-mode-page');
    if (globalBtn) {
      globalBtn.addEventListener('click', function() {
        setMode('global');
      });
    }
    if (pageBtn) {
      pageBtn.addEventListener('click', function() {
        if (pageBtn.disabled) return;
        setMode('page');
      });
    }
  }

  // Switching to global drops the page override, so the highlighted row and
  // the routing agree. Switching to page only changes what the next click
  // writes; it does not invent a temp rule.
  function setMode(mode) {
    if (mode === 'page' && !pageModeAvailable()) return;
    if (mode === OmegaPopup.mode) return;
    OmegaPopup.mode = mode;
    if (mode === 'global') clearPageTempRules();
    applyMode();
  }

  function applyMode() {
    var mode = OmegaPopup.mode;
    var available = pageModeAvailable();
    var globalBtn = document.getElementById('js-mode-global');
    var pageBtn = document.getElementById('js-mode-page');
    var scopeRow = document.getElementById('js-scope');
    var card = document.getElementById('js-profiles-card');

    var modeGroup = document.getElementById('js-mode');
    if (modeGroup) modeGroup.setAttribute('title', getMessage('popup_modeHelp'));
    if (globalBtn) {
      globalBtn.setAttribute('aria-pressed', mode === 'global' ? 'true' : 'false');
      globalBtn.classList.toggle('om-mode-selected', mode === 'global');
    }
    if (pageBtn) {
      pageBtn.disabled = !available;
      pageBtn.classList.toggle('om-disabled', !available);
      pageBtn.setAttribute('aria-pressed', mode === 'page' ? 'true' : 'false');
      pageBtn.classList.toggle('om-mode-selected', mode === 'page');
      pageBtn.setAttribute('title', available ? '' :
        getMessage('popup_tempRuleUnavailableHelp'));
    }
    if (scopeRow) {
      var showScope = mode === 'page' && !!OmegaPopup.pageScope &&
        scopeRow.querySelector('.om-segmented');
      scopeRow.classList.toggle('om-hidden', !showScope);
    }
    if (card) card.classList.toggle('om-mode-page', mode === 'page');
    refreshActive();
  }

  function activeProfileName() {
    var state = OmegaPopup.state;
    if (!state) return null;
    if (OmegaPopup.mode === 'page') {
      var scope = OmegaPopup.pageScope;
      return scope && scope.profileName || null;
    }
    if (state.isSystemProfile) return 'system';
    return state.currentProfileName || null;
  }

  // One list, two meanings: global mode highlights the global profile, page
  // mode highlights the temp rule of the selected scope. The system proxy
  // cannot ride inside a PAC script, so it is only clickable in global mode.
  function refreshActive() {
    var state = OmegaPopup.state;
    if (!state) return;
    var pageMode = OmegaPopup.mode === 'page';
    var activeName = activeProfileName();
    var card = document.getElementById('js-profiles-card');
    if (!card) return;

    card.querySelectorAll('.om-nav-item').forEach(function(item) {
      var link = item.querySelector('a');
      if (!link || !link.id || link.id.indexOf('js-profile-') !== 0 &&
          link.id !== 'js-direct' && link.id !== 'js-system') {
        return;
      }
      item.classList.remove('om-active', 'om-effective');
      var mark = link.querySelector('.om-item-mark');
      if (mark) mark.remove();
      var note = link.querySelector('.om-item-note');
      if (note) note.remove();
      link.classList.remove('om-disabled');
      if (link.getAttribute('data-om-title')) {
        link.setAttribute('title', link.getAttribute('data-om-title'));
      }
    });

    var systemLink = document.getElementById('js-system');
    if (systemLink && pageMode) {
      systemLink.classList.add('om-disabled');
      if (!systemLink.getAttribute('data-om-title')) {
        systemLink.setAttribute('data-om-title',
          systemLink.getAttribute('title') || '');
      }
      systemLink.setAttribute('title',
        getMessage('popup_tempRuleSystemGlobalOnlyHelp'));
      var note = document.createElement('span');
      note.className = 'om-item-note';
      note.textContent = getMessage('popup_tempRuleSystemGlobalOnly');
      systemLink.appendChild(note);
    }

    if (!activeName) return;
    var activeLink = activeName === 'direct' ?
      document.getElementById('js-direct') :
      activeName === 'system' ? document.getElementById('js-system') : null;
    if (!activeLink) {
      card.querySelectorAll('.om-nav-item').forEach(function(item) {
        if (item.getAttribute('data-profile') === activeName) {
          activeLink = item.querySelector('a');
        }
      });
    }
    if (!activeLink || activeLink.classList.contains('om-disabled')) return;
    activeLink.parentElement.classList.add(
      pageMode ? 'om-effective' : 'om-active');
    if (pageMode) {
      var check = document.createElement('span');
      check.className = 'om-item-mark glyphicon glyphicon-ok';
      activeLink.appendChild(check);
    }
  }

  // The temp rules that currently affect the page, most specific first.
  function pageTempRules() {
    var info = OmegaPopup.pageInfo;
    var rules = [];
    if (!info || !info.url) return rules;
    if (info.host && info.host !== info.domain &&
        info.tempRuleHostProfileName) {
      rules.push({key: info.host, profileName: info.tempRuleHostProfileName});
    }
    if (info.tempRuleProfileName) {
      rules.push({key: info.domain, profileName: info.tempRuleProfileName});
    }
    return rules;
  }

  function rememberScope(key, profileName) {
    var info = OmegaPopup.pageInfo;
    if (info) {
      if (key === info.host && key !== info.domain) {
        info.tempRuleHostProfileName = profileName;
      }
      if (key === info.domain) info.tempRuleProfileName = profileName;
    }
    (OmegaPopup.pageScopes || []).forEach(function(scope) {
      if (scope.key === key) scope.profileName = profileName;
    });
  }

  // Clear the page-level override and go back to following the global
  // profile. The popup stays open so the list can reflect the change.
  function clearPageTempRules() {
    pageTempRules().forEach(function(rule) {
      if (OmegaPopup.clearTempRule) {
        OmegaPopup.clearTempRule(rule.key, rule.profileName);
      }
      rememberScope(rule.key, null);
    });
    refreshActive();
  }

  // Write the chosen profile as the temp rule of the selected scope. A click
  // on the profile that is already set removes the rule instead. toggle is
  // omitted on purpose: force-add (1) refuses to replace an existing rule.
  function applyPageProfile(profileName) {
    var scope = OmegaPopup.pageScope;
    if (!scope || profileName === 'system') return;
    var removing = scope.profileName === profileName;
    if (OmegaPopup.addTempRule) {
      OmegaPopup.addTempRule(scope.key, profileName);
    }
    rememberScope(scope.key, removing ? null : profileName);
    refreshActive();
  }

  function showMenuForExternalProfile(state) {
    var profile = state.externalProfile;
    profile.name = getMessage('popup_externalProfile');
    var profileDisp = createMenuItemForProfile(profile);

    var link = profileDisp.querySelector('a');
    link.id = 'js-external';
    link.addEventListener('click', function() {
      location.href = '../popup.html#!external';
    });

    if (state.currentProfileName === '') {
      profileDisp.classList.add('om-effective');
    }

    var profilesEnd = document.getElementById('js-profiles-end');
    profilesEnd.parentElement.insertBefore(profileDisp, profilesEnd);
  }

  function updateOtherItems(state) {
    var hasValidResults = state && state.validResultProfiles &&
      state.validResultProfiles.length;
    var showAddRule = hasValidResults && state.currentProfileCanAddRule;
    document.querySelector('.om-nav-addrule')
      .classList.toggle('om-hidden', !showAddRule);
    document.getElementById('js-profiles-end')
      .classList.toggle('om-hidden', !showAddRule);
    if (!showAddRule) document.getElementById('js-addrule').href = '#';
    applyMode();
  }

  function colorizeIcon(targetEl, color) {
    var icon = targetEl.querySelector('.glyphicon');
    if (icon && color) icon.style.color = color;
  }

  function addProfilesItems(state) {
    var systemProfileDisp = document.getElementById('js-system');
    var directProfileDisp = document.getElementById('js-direct');
    var systemProfile = state.availableProfiles['+system'];
    var directProfile = state.availableProfiles['+direct'];
    directProfileDisp.parentElement.setAttribute('data-profile', 'direct');
    systemProfileDisp.parentElement.setAttribute('data-profile', 'system');
    colorizeIcon(systemProfileDisp, systemProfile.color);
    systemProfileDisp.setAttribute('title', systemProfile.desc);
    colorizeIcon(directProfileDisp, directProfile.color);
    directProfileDisp.setAttribute('title', directProfile.desc);

    var profilesEnd = document.getElementById('js-profiles-end');
    var profilesContainer = profilesEnd.parentElement;
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

      profilesContainer.insertBefore(profileDisp, profilesEnd);
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
    icon.style.color = targetProfile.color;
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
        li.classList.add('om-active');
      }
      ul.appendChild(li);
    });
    return ul;
  }
})();
