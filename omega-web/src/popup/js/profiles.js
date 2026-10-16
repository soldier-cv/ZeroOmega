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

  $script.ready('om-state', updateMenuByState);
  $script.ready('om-page-info', updateMenuByPageInfo);
  $script.ready(['om-state', 'om-page-info'], updateMenuByStateAndPageInfo);

  return;

  function getMessage(id, args) {
    return OmegaTargetPopup.getMessage(id, args);
  }

  function createDivider() {
    var divider = document.createElement('li');
    divider.className = 'om-divider';
    return divider;
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
    OmegaPopup.showTempRuleDropdown = showTempRuleDropdown;
    $script.done('om-dropdowns');
  }

  // Show which profile actually applies to the current page: a temp rule
  // (more specific scope first) takes precedence over the global profile.
  function renderPageSection(info) {
    var section = document.getElementById('js-page-section');
    section.classList.remove('om-hidden');
    var hostText = document.getElementById('js-page-host');
    hostText.textContent = info.host || info.domain;
    hostText.parentElement.setAttribute('title', info.url || '');
    document.getElementById('js-temprule-label').textContent =
      getMessage('popup_tempRuleLabel');
    updateTempRuleRow();
  }

  function tempRuleForPage(info) {
    if (info.host && info.host !== info.domain && info.tempRuleHostProfileName) {
      return {key: info.host, profileName: info.tempRuleHostProfileName};
    }
    if (info.tempRuleProfileName) {
      return {key: info.domain, profileName: info.tempRuleProfileName};
    }
    return null;
  }

  function createProfileChip(profile) {
    var chip = document.createElement('span');
    chip.className = 'om-chip';
    var icon = document.createElement('span');
    icon.className = 'glyphicon ' +
      (iconForProfileType[profile.profileType] || 'glyphicon-question-sign');
    if (profile.color) icon.style.color = profile.color;
    chip.appendChild(icon);
    var name = document.createElement('span');
    name.className = 'om-chip-name';
    name.textContent = getMessage('profile_' + profile.name) || profile.name;
    chip.appendChild(name);
    return chip;
  }

  function addCurrentChip(item) {
    var link = item.querySelector('a');
    if (!link || link.querySelector('.om-chip-current')) return;
    var chip = document.createElement('span');
    chip.className = 'om-chip om-chip-current';
    chip.textContent = getMessage('popup_current');
    link.appendChild(chip);
  }

  function updateTempRuleRow() {
    var row = document.querySelector('.om-temprule');
    if (!row) return;
    var link = document.getElementById('js-temprule');
    var stateEl = document.getElementById('js-temprule-state');
    var caret = row.querySelector('.om-caret');
    var state = OmegaPopup.state;
    var info = OmegaPopup.pageInfo;
    var available = !!(state && state.validResultProfiles &&
      state.validResultProfiles.length);

    stateEl.textContent = '';
    row.classList.remove('om-temprule-active');
    link.classList.toggle('om-disabled', !available);
    caret.classList.toggle('om-hidden', !available);
    link.setAttribute('title', available ?
      getMessage('popup_tempRuleHelp') :
      getMessage('popup_tempRuleUnavailableHelp'));
    if (!available) {
      stateEl.textContent = getMessage('popup_tempRuleUnavailable');
      return;
    }
    var rule = info && info.url ? tempRuleForPage(info) : null;
    if (rule) {
      row.classList.add('om-temprule-active');
      var profile = state.availableProfiles['+' + rule.profileName] ||
        {name: rule.profileName};
      stateEl.appendChild(createProfileChip(profile));
    } else {
      stateEl.textContent = getMessage('popup_tempRuleNone');
    }
  }

  function showMenuForExternalProfile(state) {
    var profile = state.externalProfile;
    profile.name = getMessage('popup_externalProfile')
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

  function showTempRuleDropdown() {
    var link = document.getElementById('js-temprule');
    if (!link || link.classList.contains('om-disabled')) return;
    var tempRuleItem = document.querySelector('.om-temprule');
    toggleDropdown(tempRuleItem, createTempRuleDropdown);
    link.focus();
  }

  function updateOtherItems(state) {
    var hasValidResults = state && state.validResultProfiles &&
      state.validResultProfiles.length;
    if (!hasValidResults || !state.currentProfileCanAddRule) {
      document.querySelector('.om-nav-addrule').classList.add('om-hidden');
      document.getElementById('js-addrule').href = '#';
      document.getElementById('js-profiles-end').classList.add('om-hidden');
    }
    updateTempRuleRow();
  }

  function colorizeIcon(targetEl, color) {
    var icon = targetEl.querySelector('.glyphicon');
    if (icon && color) icon.style.color = color;
  }

  function addProfilesItems(state) {
    var systemProfileDisp = document.getElementById('js-system');
    var directProfileDisp = document.getElementById('js-direct');
    var systemProfile = state.availableProfiles['+system']
    var directProfile = state.availableProfiles['+direct']
    var currentProfileClass = 'om-active';
    if (state.isSystemProfile) {
      systemProfileDisp.parentElement.classList.add('om-active');
      currentProfileClass = 'om-effective';
    }
    if (state.currentProfileName === 'direct') {
      directProfileDisp.parentElement.classList.add(currentProfileClass);
    }
    colorizeIcon(systemProfileDisp, systemProfile.color)
    systemProfileDisp.setAttribute('title',
      systemProfile.desc);
    colorizeIcon(directProfileDisp, directProfile.color)
    directProfileDisp.setAttribute('title',
      directProfile.desc);
    if (systemProfileDisp.parentElement.classList.contains('om-active')) {
      addCurrentChip(systemProfileDisp.parentElement);
    }
    if (directProfileDisp.parentElement.classList.contains('om-active')) {
      addCurrentChip(directProfileDisp.parentElement);
    }

    var profilesEnd = document.getElementById('js-profiles-end');
    var profilesContainer = profilesEnd.parentElement;
    var profileCount = 0;
    var charCodeUnderscore = '_'.charCodeAt(0)
    var profiles = Object.keys(state.availableProfiles).map(function(key) {
      return state.availableProfiles[key];
    }).sort(compareProfile);
    profiles.forEach(function(profile) {
      if (profile.builtin) return;
      if (profile.name.charCodeAt(0) === charCodeUnderscore) return;
      profileCount++;

      var profileDisp = createMenuItemForProfile(profile,
        state.availableProfiles);
      var link = profileDisp.querySelector('a');
      link.id = 'js-profile-' + profileCount;
      link.addEventListener('click', function() {
        $script.ready('om-main', function() {
          OmegaPopup.applyProfile(profile.name);
        });
      });

      if (profile.name === state.currentProfileName) {
        profileDisp.classList.add(currentProfileClass);
      }

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

      if (profileDisp.classList.contains('om-active')) {
        addCurrentChip(profileDisp);
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
    icon.setAttribute('class', 'glyphicon ' + iconClass)
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

  function createTempRuleDropdown() {
    var ul = document.createElement('ul');
    var state = OmegaPopup.state;
    var pageInfo = OmegaPopup.pageInfo;

    // Temp rules can be scoped to the current subdomain or the whole domain.
    // The current subdomain comes first, and is the default scope.
    var scopes = [];
    if (pageInfo.host && pageInfo.domain && pageInfo.host !== pageInfo.domain) {
      scopes.push({
        key: pageInfo.host,
        profileName: pageInfo.tempRuleHostProfileName,
        labelId: 'popup_tempRuleScopeSubdomain',
      });
    }
    scopes.push({
      key: pageInfo.domain,
      profileName: pageInfo.tempRuleProfileName,
      labelId: 'popup_tempRuleScopeDomain',
    });
    var scope = scopes[0];
    var scopeButtons = [];
    var scopeHint;
    var removeDivider;
    var removeItem;

    if (scopes.length > 1) {
      var scopeLabel = document.createElement('li');
      scopeLabel.className = 'om-dropdown-label';
      scopeLabel.textContent = getMessage('popup_tempRuleScope');
      ul.appendChild(scopeLabel);

      var segmented = document.createElement('li');
      segmented.className = 'om-segmented';
      scopes.forEach(function(scopeItem) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'om-segmented-btn';
        button.textContent = getMessage(scopeItem.labelId);
        button.setAttribute('title', scopeItem.key);
        button.addEventListener('click', function() {
          if (scope === scopeItem) return;
          scope = scopeItem;
          updateScope();
        });
        scopeButtons.push({scope: scopeItem, el: button});
        segmented.appendChild(button);
      });
      ul.appendChild(segmented);
    }

    var hintItem = document.createElement('li');
    hintItem.className = 'om-scope-hint';
    scopeHint = document.createElement('span');
    hintItem.appendChild(scopeHint);
    ul.appendChild(hintItem);

    ul.appendChild(createDivider());

    var profilesLabel = document.createElement('li');
    profilesLabel.className = 'om-dropdown-label';
    profilesLabel.textContent = getMessage('popup_tempRuleApplyProfile');
    ul.appendChild(profilesLabel);

    removeDivider = createDivider();
    removeDivider.classList.add('om-temprule-remove-divider', 'om-hidden');
    ul.appendChild(removeDivider);

    removeItem = document.createElement('li');
    removeItem.className = 'om-nav-item om-temprule-remove om-hidden';
    var removeLink = document.createElement('a');
    removeLink.href = '#';
    var removeIcon = document.createElement('span');
    removeIcon.className = 'glyphicon glyphicon-trash';
    removeLink.appendChild(removeIcon);
    var removeText = document.createElement('span');
    removeText.textContent = getMessage('popup_tempRuleRemove');
    removeLink.appendChild(removeText);
    removeLink.addEventListener('click', function(e) {
      e.preventDefault();
      $script.ready('om-main', function() {
        OmegaPopup.addTempRule(scope.key, scope.profileName, -1);
      });
    });
    removeItem.appendChild(removeLink);
    ul.appendChild(removeItem);

    function updateScope() {
      scopeButtons.forEach(function(item) {
        item.el.classList.toggle('om-scope-selected', item.scope === scope);
      });
      scopeHint.textContent = getMessage('popup_tempRuleAppliesTo',
        [scope.key]);
      var hasRule = !!scope.profileName;
      removeDivider.classList.toggle('om-hidden', !hasRule);
      removeItem.classList.toggle('om-hidden', !hasRule);
      renderProfiles();
    }

    function renderProfiles() {
      ul.querySelectorAll('.om-temprule-profile').forEach(function(item) {
        item.remove();
      });
      var profiles = state.validResultProfiles.map(function(name) {
        return state.availableProfiles['+' + name];
      }).sort(compareProfile);
      profiles.forEach(function(profile) {
        if (profile.name.indexOf('__') === 0) return;
        if ((profile.name === state.currentProfileName) &&
          (!scope.profileName) &&
          (state.validResultProfiles.length > 1)
        ) return;
        var li = createMenuItemForProfile(profile, state.availableProfiles);
        li.classList.add('om-temprule-profile');
        var link = li.querySelector('a');
        link.addEventListener('click', function(e) {
          e.preventDefault();
          $script.ready('om-main', function() {
            OmegaPopup.addTempRule(scope.key, profile.name);
          });
        });
        if (profile.name === scope.profileName) {
          li.classList.add('om-active');
          var mark = document.createElement('span');
          mark.className = 'om-item-mark glyphicon glyphicon-ok';
          link.appendChild(mark);
        }
        ul.insertBefore(li, removeDivider);
      });
    }

    updateScope();
    return ul;
  }

  function createDefaultProfileDropdown(profile) {
    var ul = document.createElement('ul');
    var state = OmegaPopup.state;
    var profiles = profile.validResultProfiles.map(function(name) {
      return state.availableProfiles['+' + name];
    }).sort(compareProfile);
    profiles.forEach(function(resultProfile) {
      if (resultProfile.name.indexOf('__') === 0) return;
      if ((resultProfile === profile.currentProfileName) &&
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
