$script.ready('om-page-info', function() {
  setText('#js-direct .om-profile-name', 'profile_direct');
  setText('#js-system .om-profile-name', 'profile_system');
  setText('#js-addrule-label', 'popup_addCondition');
  setText('#js-option-label', 'popup_showOptions');
  setText('#js-page-title', 'popup_sectionPage');
  setText('#js-profiles-title', 'popup_sectionProfiles');
  return;

  function setText(selector, messageId) {
    var el = document.querySelector(selector);
    if (el) el.textContent = OmegaTargetPopup.getMessage(messageId);
  }
});
