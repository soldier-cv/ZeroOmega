(function() {
  var keyHandler = {
    38: moveUp, // Up
    40: moveDown, // Down

    74: moveDown, // j
    75: moveUp, // k

    191: showKeyboardHelp, // /
    63: showKeyboardHelp, // ?

    48: 'js-direct', // 0
    79: 'js-option', // o
    82: 'js-reqinfo', // r
  };

  for (i = 1; i <= 9; i++) {
    keyHandler[48 + i] = 'js-profile-' + i;
  }

  var walker;
  return init();

  function init() {
    walker = document.createTreeWalker(
      document.querySelector('.om-nav'),
      NodeFilter.SHOW_ELEMENT,
      {acceptNode: tabbableElementsOnly}
    );

    // Keyboard users need a starting point for j/k and the arrow keys; the
    // nav root keeps the selected row free of a focus ring.
    walker.root.focus();

    window.addEventListener('keydown', function(e) {
      var handler = keyHandler[e.keyCode];
      if (handler == null) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (typeof handler === 'string') {
        clickById(handler);
      } else {
        handler();
      }
    });
  }

  function tabbableElementsOnly(node) {
    if (node.classList.contains('om-hidden')) {
      return NodeFilter.FILTER_REJECT;
    } else if (node.tabIndex >= 0) {
      return NodeFilter.FILTER_ACCEPT;
    } else {
      return NodeFilter.FILTER_SKIP;
    }
  }

  function moveUp() {
    walker.currentNode = document.activeElement;
    var result = null;
    if (walker.currentNode) {
      result = walker.previousNode();
    }
    if (!result) {
      walker.currentNode = walker.root.lastElementChild;
      walker.previousNode();
      walker.nextNode();
    }
    walker.currentNode.focus();
  }

  function moveDown() {
    walker.currentNode = document.activeElement;
    var result = null;
    if (walker.currentNode) {
      result = walker.nextNode();
    }
    if (!result) {
      walker.currentNode = walker.root;
      walker.nextNode();
    }
    walker.currentNode.focus();
  }

  function showKeyboardHelp() {
    $script('js/keyboard_help.js');
  }

  function clickById(id) {
    var element = document.getElementById(id);
    if (element && !element.closest('.om-hidden')) element.click();
  }
})();
