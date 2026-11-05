#!/usr/bin/env node
// Refresh omega-pac/src/public_suffix_rules.json from publicsuffix.org, in the
// format tldjs expects. Run from the repository root with network access:
//   node tools/update_public_suffix.js
var https = require('https');
var fs = require('fs');
var path = require('path');

var tldjs = path.join(__dirname, '..', 'omega-pac', 'node_modules', 'tldjs');
var parser = require(path.join(tldjs, 'lib', 'parsers', 'publicsuffix-org.js'));
var exportTask = require(path.join(tldjs, 'lib', 'exports', 'standard-json.js'));
var target = path.join(__dirname, '..', 'omega-pac', 'src',
  'public_suffix_rules.json');

https.get('https://publicsuffix.org/list/public_suffix_list.dat', function(res) {
  if (res.statusCode !== 200) {
    console.error('HTTP ' + res.statusCode);
    process.exit(1);
  }
  var body = '';
  res.setEncoding('utf8');
  res.on('data', function(chunk) { body += chunk; });
  res.on('end', function() {
    var rules = exportTask(parser.parse(body))[1];
    fs.writeFileSync(target, JSON.stringify(rules));
    console.log('wrote ' + Object.keys(rules).length + ' TLDs to ' + target);
  });
}).on('error', function(err) {
  console.error(err.message);
  process.exit(1);
});
