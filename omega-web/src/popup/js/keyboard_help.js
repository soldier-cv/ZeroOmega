(function() {
  var keyForId = {
    'js-direct': '0',
    'js-system': 'S',
    'js-external': 'E',
    'js-addrule': 'A',
    'js-mode-toggle': 'T',
    'js-option': 'O',
    'js-reqinfo': 'R'
  }
  Object.keys(keyForId).forEach(function (id) {
    showHelp(id, keyForId[id]);
  });

  for (var i = 1; i <= 9; i++) {
    showHelp('js-profile-' + i, '' + i);
  }

  return;

  function showHelp(id, key) {
    var element = document.getElementById(id);
    if (!element) return;
    if (!element.querySelector('.om-keyboard-help')) {
      var span = document.createElement('span');
      span.classList.add('om-keyboard-help');
      span.textContent = key;
      var reference = element.querySelector('.glyphicon');
      if (reference) {
        reference.parentNode.insertBefore(span, reference.nextSibling);
      } else if (element.classList.contains('om-switch')) {
        // The mode chip is a pill; a leading badge would push the label off
        // its left padding, so the hint goes after the label instead.
        element.appendChild(span);
      } else {
        element.insertBefore(span, element.firstChild);
      }
    }
  }
})();
