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
