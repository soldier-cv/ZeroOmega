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
    if (perSiteAvailable() && !ownRule()) {
      var seed = seedProfile();
      if (seed) writePageRoute(seed, false);
    }
    renderCurrent();
  }

  // Force set (2) never toggles: a stale pageInfo copy must not turn a click
  // into a delete. Refresh is explicit so re-clicking the checked profile
  // still reloads the page with that profile instead of looking inert.
  function writePageRoute(profileName, refresh) {
    var info = OmegaPopup.pageInfo;
    if (!info || !info.host || !profileName) return false;
    if (!OmegaPopup.addTempRule) return false;
    OmegaPopup.addTempRule(info.host, profileName, 2, !!refresh);
    info.tempRuleHostProfileName = profileName;
    info.tempRuleMatch = {key: info.host, profileName: profileName};
    return true;
  }

  function applyPageProfile(profileName) {
    if (!validProfileName(profileName)) return;
    if (!writePageRoute(profileName, true)) return;
    renderCurrent();
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
    var rule = ownRule();
    var activeName = rule && rule.profileName;

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
