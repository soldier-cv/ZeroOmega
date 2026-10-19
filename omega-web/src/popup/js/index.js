(function() {
  handleClick('js-option', showOptions);
  handleClick('js-direct', chooseProfile.bind(this, 'direct'));
  handleClick('js-system', chooseProfile.bind(this, 'system'));
  OmegaPopup.addTempRule = addTempRule;
  OmegaPopup.clearTempRule = clearTempRule;
  OmegaPopup.setDefaultProfile = setDefaultProfile;
  OmegaPopup.applyProfile = applyProfile;
  OmegaPopup.chooseProfile = chooseProfile;
  return;

  function handleClick(id, handler) {
    document.getElementById(id).addEventListener('click', handler, false);
  }

  function closePopup() {
    window.top.close();
    // If the popup is opened as a tab, the above won't work. Let's reload then.
    document.body.style.opacity = 0;
    setTimeout(function() { history.go(0); }, 300);
  }

  function showOptions(e) {
    if (typeof OmegaTargetPopup !== 'undefined') {
      try {
        OmegaTargetPopup.openOptions(null, closePopup);
        e.preventDefault();
      } catch (_) {
      }
    }
  }

  function applyProfile(profileName) {
    $script.ready('om-target', function() {
      OmegaTargetPopup.applyProfile(profileName, closePopup);
    });
  }

  // A click on a profile row does whatever the mode button says: in global
  // mode it becomes the global profile; in page mode it is written as a temp
  // rule for the chosen scope only.
  function chooseProfile(profileName) {
    $script.ready('om-target', function() {
      if (OmegaPopup.mode === 'page') {
        if (profileName === 'system') return;
        if (OmegaPopup.applyPageProfile) OmegaPopup.applyPageProfile(profileName);
      } else {
        applyProfile(profileName);
      }
    });
  }

  // Remove a temp rule without closing the popup, so the page card can update
  // its state in place.
  function clearTempRule(domain, profileName) {
    $script.ready('om-target', function() {
      OmegaTargetPopup.addTempRule(domain, profileName, -1);
    });
  }

  function setDefaultProfile(profileName, defaultProfileName) {
    $script.ready('om-target', function() {
      OmegaTargetPopup.setDefaultProfile(profileName, defaultProfileName,
        closePopup);
    });
  }

  function addTempRule(domain, profileName, toggle) {
    $script.ready('om-target', function() {
      // The popup stays open: the page route is applied immediately and the
      // header reports it, so the user can switch scope or profile again.
      OmegaTargetPopup.addTempRule(domain, profileName, toggle);
    });
  }
})();
