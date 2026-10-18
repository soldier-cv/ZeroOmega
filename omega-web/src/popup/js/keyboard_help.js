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
      // The mode chip has no icon and a leading badge would crowd its label,
      // so the hint goes after it.
      if (element.classList.contains('om-switch')) {
        element.appendChild(span);
      } else if (reference) {
        reference.parentNode.insertBefore(span, reference.nextSibling);
      } else {
        element.insertBefore(span, element.firstChild);
      }
    }
  }
})();
