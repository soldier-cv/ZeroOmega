(function() {
  handleClick('js-option', showOptions);
  handleClick('js-direct', chooseProfile.bind(this, 'direct'));
  handleClick('js-system', chooseProfile.bind(this, 'system'));
  OmegaPopup.addTempRule = addTempRule;
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

  // There is only one list now: a click always sets this site's rule. The
  // check mark and the page reload come from the popup and the background
  // respectively; nothing here switches scopes or closes the popup.
  function chooseProfile(profileName) {
    $script.ready('om-target', function() {
      if (profileName === 'system') return;
      if (OmegaPopup.applyPageProfile) OmegaPopup.applyPageProfile(profileName);
    });
  }

  // refreshAlways forces the active page to reload even when the route text is
  // unchanged, so re-clicking the checked profile still refreshes it.
  function addTempRule(domain, profileName, toggle, refreshAlways) {
    $script.ready('om-target', function() {
      OmegaTargetPopup.addTempRule(domain, profileName, toggle, null,
        refreshAlways);
    });
  }
})();
