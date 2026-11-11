chai = require 'chai'
should = chai.should()
sinon = require 'sinon'
chai.use require('sinon-chai')
Promise = require 'bluebird'
OmegaPac = require 'omega-pac'
Options = require '../src/options'

describe 'Options#addTempRule', ->
  createOptions = ->
    log = {method: sinon.stub(), error: sinon.stub()}
    options = new Options(null, null, log)
    options._options =
      '+switch':
        name: 'switch'
        profileType: 'SwitchProfile'
        color: '#337ab7'
        defaultProfileName: 'direct'
        rules: []
      '+proxy':
        name: 'proxy'
        profileType: 'FixedProfile'
        color: '#ac725e'
        proxyForHttp:
          scheme: 'http'
          host: '127.0.0.1'
          port: 8888
    options._currentProfileName = 'switch'
    options.applyProfile = -> Promise.resolve()
    options

  patterns = (options) ->
    options._tempProfile.rules.map (rule) -> rule.condition.pattern

  it 'should insert a subdomain rule before an existing domain rule', ->
    options = createOptions()
    options.addTempRule('findfine.com', 'direct').then ->
      options.addTempRule('postest.findfine.com', 'proxy')
    .then ->
      patterns(options).should.eql ['*.postest.findfine.com', '*.findfine.com']

  it 'should keep subdomain rules before domain rules regardless of order', ->
    options = createOptions()
    options.addTempRule('postest.findfine.com', 'proxy').then ->
      options.addTempRule('findfine.com', 'direct')
    .then ->
      patterns(options).should.eql ['*.postest.findfine.com', '*.findfine.com']

  it 'should order deeper subdomains before their parents', ->
    options = createOptions()
    options.addTempRule('findfine.com', 'direct').then ->
      options.addTempRule('postest.findfine.com', 'direct')
    .then ->
      options.addTempRule('a.postest.findfine.com', 'proxy')
    .then ->
      patterns(options).should.eql [
        '*.a.postest.findfine.com'
        '*.postest.findfine.com'
        '*.findfine.com'
      ]

  it 'should match the most specific rule for the request host', ->
    options = createOptions()
    options.addTempRule('findfine.com', 'direct').then ->
      options.addTempRule('postest.findfine.com', 'proxy')
    .then ->
      requestFromUrl = OmegaPac.Conditions.requestFromUrl
      request = requestFromUrl 'http://postest.findfine.com/'
      OmegaPac.Profiles.match(options._tempProfile, request).profileName
        .should.equal 'proxy'
      request = requestFromUrl 'http://www.findfine.com/'
      OmegaPac.Profiles.match(options._tempProfile, request).profileName
        .should.equal 'direct'
      request = requestFromUrl 'http://other.com/'
      OmegaPac.Profiles.match(options._tempProfile, request)
        .should.eql ['+switch', null]

  it 'should query rules by their exact key', ->
    options = createOptions()
    options.addTempRule('postest.findfine.com', 'proxy').then ->
      options.queryTempRule('postest.findfine.com').should.equal 'proxy'
      should.not.exist options.queryTempRule('findfine.com')

  it 'should toggle a subdomain rule off when applied twice', ->
    options = createOptions()
    options.addTempRule('postest.findfine.com', 'proxy').then ->
      options.addTempRule('postest.findfine.com', 'proxy')
    .then ->
      patterns(options).should.eql []
      should.not.exist options.queryTempRule('postest.findfine.com')

  it 'should force-set a rule without ever deleting it', ->
    options = createOptions()
    options.addTempRule('postest.findfine.com', 'proxy', 2).then ->
      # Same profile, stale caller: still there, and no second PAC update.
      options.addTempRule('postest.findfine.com', 'proxy', 2)
    .then ->
      options.queryTempRule('postest.findfine.com').should.equal 'proxy'
      options.addTempRule('postest.findfine.com', 'direct', 2)
    .then ->
      options.queryTempRule('postest.findfine.com').should.equal 'direct'
      patterns(options).should.eql ['*.postest.findfine.com']
      options._tempProfileRulesByProfile['+direct'].should.have.length 1
      options._tempProfileRulesByProfile['+proxy'].should.have.length 0

  it 'should force-delete regardless of the profile name the caller passes', ->
    options = createOptions()
    options.addTempRule('postest.findfine.com', 'proxy', 2).then ->
      # A stale pageInfo copy may name a different profile.
      options.addTempRule('postest.findfine.com', 'direct', -1)
    .then ->
      patterns(options).should.eql []
      should.not.exist options.queryTempRule('postest.findfine.com')
      options.exportTempRules().should.eql {}

  it 'should keep force-add from overwriting an existing rule', ->
    options = createOptions()
    options.addTempRule('postest.findfine.com', 'proxy', 2).then ->
      options.addTempRule('postest.findfine.com', 'direct', 1)
    .then ->
      options.queryTempRule('postest.findfine.com').should.equal 'proxy'

describe 'Options#replaceTempRules', ->
  createOptions = ->
    log = {method: sinon.stub(), error: sinon.stub()}
    options = new Options(null, null, log)
    options._options =
      '+switch':
        name: 'switch'
        profileType: 'SwitchProfile'
        defaultProfileName: 'direct'
        rules: []
      '+proxy':
        name: 'proxy'
        profileType: 'FixedProfile'
        proxyForHttp: {scheme: 'http', host: '127.0.0.1', port: 8888}
    options._currentProfileName = 'switch'
    options.applyProfile = sinon.stub().returns(Promise.resolve())
    options

  it 'should round-trip through exportTempRules', ->
    options = createOptions()
    options.addTempRule('findfine.com', 'direct').then ->
      options.addTempRule('postest.findfine.com', 'proxy')
    .then ->
      exported = options.exportTempRules()
      exported.should.eql
        'findfine.com': 'direct'
        'postest.findfine.com': 'proxy'
      fresh = createOptions()
      fresh.replaceTempRules(exported).then ->
        fresh.exportTempRules().should.eql exported
        fresh._tempProfile.rules.map((r) -> r.condition.pattern)
          .should.eql ['*.postest.findfine.com', '*.findfine.com']

  it 'should drop rules for profiles that do not exist', ->
    options = createOptions()
    options.replaceTempRules({'a.com': 'proxy', 'b.com': 'gone'}).then ->
      options.exportTempRules().should.eql {'a.com': 'proxy'}

  it 'should report the rule that actually matches a host', ->
    options = createOptions()
    options.replaceTempRules(
      'cc.cd': 'proxy'
      'postest.findfine.com': 'direct'
      'findfine.com': 'proxy'
    ).then ->
      options.matchTempRule('a.postest.findfine.com').should.eql
        key: 'postest.findfine.com', profileName: 'direct'
      options.matchTempRule('www.findfine.com').should.eql
        key: 'findfine.com', profileName: 'proxy'
      options.matchTempRule('ai.helunox.cc.cd').should.eql
        key: 'cc.cd', profileName: 'proxy'
      should.not.exist options.matchTempRule('other.com')

  it 'should replace existing rules instead of merging', ->
    options = createOptions()
    options.addTempRule('old.com', 'proxy').then ->
      options.replaceTempRules({'new.com': 'direct'})
    .then ->
      options.exportTempRules().should.eql {'new.com': 'direct'}
      should.not.exist options.queryTempRule('old.com')
      options.addTempRule('new.com', 'proxy')
    .then ->
      options.queryTempRule('new.com').should.equal 'proxy'

describe 'Options#profile references and temp rules', ->
  createOptions = (opts = {}) ->
    log = {method: sinon.stub(), error: sinon.stub()}
    options = new Options(null, null, log)
    options._options =
      '+switch':
        name: 'switch'
        profileType: 'SwitchProfile'
        defaultProfileName: 'direct'
        rules: []
      '+proxy':
        name: 'proxy'
        profileType: 'FixedProfile'
        proxyForHttp: {scheme: 'http', host: '127.0.0.1', port: 8888}
    if opts.withProxy2
      options._options['+proxy2'] =
        name: 'proxy2'
        profileType: 'FixedProfile'
        proxyForHttp: {scheme: 'http', host: '127.0.0.1', port: 8889}
    options._currentProfileName = 'switch'
    options.applyProfile = sinon.stub().returns(Promise.resolve())
    options._tempRulesChanged = sinon.stub()
    unless opts.realSetOptions
      options._setOptions = sinon.stub().returns(Promise.resolve())
    options

  it 'should move temp rules to the new name when a profile is renamed', ->
    options = createOptions()
    options.addTempRule('postest.findfine.com', 'proxy').then ->
      options.renameProfile('proxy', 'proxy2')
    .then ->
      options.exportTempRules().should.eql
        'postest.findfine.com': 'proxy2'
      options.queryTempRule('postest.findfine.com').should.equal 'proxy2'
      options._tempProfileRulesByProfile['+proxy2'].should.have.length 1
      should.not.exist options._tempProfileRulesByProfile['+proxy']
      options._tempRulesChanged.should.have.been.called

  it 'should move temp rules when references are replaced', ->
    options = createOptions(withProxy2: true)
    options.addTempRule('postest.findfine.com', 'proxy').then ->
      options.replaceRef('proxy', 'proxy2')
    .then ->
      options.exportTempRules().should.eql
        'postest.findfine.com': 'proxy2'
      options._tempRulesChanged.should.have.been.called

  it 'should drop and report temp rules for a deleted profile', ->
    options = createOptions(realSetOptions: true)
    options._state = {set: sinon.stub().returns(Promise.resolve())}
    options._storage =
      set: sinon.stub().returns(Promise.resolve())
      remove: sinon.stub().returns(Promise.resolve())
    options.addTempRule('postest.findfine.com', 'proxy').then ->
      options._setOptions({'+proxy': undefined})
    .then ->
      options.exportTempRules().should.eql {}
      options._tempRulesChanged.should.have.been.called

