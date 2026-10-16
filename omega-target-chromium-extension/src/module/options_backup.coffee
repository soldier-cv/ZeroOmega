### @module omega-target-chromium-extension/options_backup ###
OmegaTarget = require('omega-target')
Promise = OmegaTarget.Promise

COMMIT_FILENAME = 'zeroomega-commit.txt'
OPTION_FILE_PREFIX = 'zeroomega-'
OPTION_FILE_SUFFIX = '.json'

# Debounce (ms) applied to auto backups after options change.
AUTO_BACKUP_DEBOUNCE = 2000
# Time (ms) during which auto backups are suppressed after a restore, so that
# the options re-initialization triggered by the restore does not immediately
# push a fresh backup back to the server.
RESTORE_SUPPRESS_TIME = 15000

###*
# Minimal WebDAV client dedicated to ZeroOmega option backups.
#
# The remote layout matches the previous sync backend:
#   <uri>/zeroomega/zeroomega-commit.txt
#   <uri>/zeroomega/zeroomega-<commitId>.json
#
# Only the latest backup is kept: after a successful upload the previous
# option file is deleted.
###
class WebDavClient
  constructor: ->
    @baseUri = ''
    @password = ''
    @username = ''
    @_authHeader = null
    @_authResolved = false

  init: (config) ->
    uri = (config.uri || '').replace(/\/+$/, '')
    if not uri
      throw new Error('WebDAV URI is required.')
    @baseUri = uri + '/zeroomega/'
    @password = config.password || ''
    @username = config.username || ''
    @_authHeader = null
    @_authResolved = false
    @_ensureDir()

  _fetch: (url, options = {}) ->
    doFetch = =>
      if @_authHeader
        options.headers ?= {}
        Object.assign(options.headers, @_authHeader)
      fetch(url, options)

    doFetch().then (res) =>
      if res.status == 401
        @_negotiateAuth(url, options.method || 'GET').then (authHeader) =>
          if authHeader
            @_authHeader = authHeader
            @_authResolved = true
            newOpts = JSON.parse(JSON.stringify(options))
            newOpts.headers ?= {}
            Object.assign(newOpts.headers, authHeader)
            fetch(url, newOpts)
          else
            res
      else
        res

  _negotiateAuth: (url, method) ->
    fetch(url, method: method).then (res) =>
      if res.status != 401
        @_authResolved = true
        return null
      wwwAuth = res.headers.get('WWW-Authenticate')
      if not wwwAuth
        return @_basicAuthHeader()
      basicMatch = wwwAuth.match(/Basic\s+(?:realm=)?([^,]*)/i)
      if basicMatch
        return @_basicAuthHeader()
      bearerMatch = wwwAuth.match(/Bearer\s+(.+?)(?:,|$)/i)
      if bearerMatch
        return @_bearerAuthHeader()
      if wwwAuth.match(/Digest\s+/i)
        throw new Error('Digest authentication is not supported. ' +
          'Use Basic authentication on your WebDAV server.')
      return @_basicAuthHeader()

  _basicAuthHeader: ->
    if @username and @password
      enc = btoa(@username + ':' + @password)
      return {"Authorization": "Basic " + enc}
    else if @password
      enc = btoa(':' + @password)
      return {"Authorization": "Basic " + enc}
    return null

  _bearerAuthHeader: ->
    if @password
      return {"Authorization": "Bearer " + @password}
    return null

  _optionFilename: (commitId) ->
    OPTION_FILE_PREFIX + commitId + OPTION_FILE_SUFFIX

  _ensureDir: ->
    @_fetch(@baseUri, method: "MKCOL").catch(-> return)

  getLastCommit: ->
    @_fetch(@baseUri + COMMIT_FILENAME).then((res) ->
      if res.status == 404
        return null
      if not res.ok
        throw new Error(
          "WebDAV getLastCommit failed: " + res.status)
      res.text()
    ).then((text) ->
      commitId = text?.trim() || null
      if commitId and not /^[a-zA-Z0-9]+$/.test(commitId)
        throw new Error("Remote " + COMMIT_FILENAME +
          " contains illegal characters")
      commitId
    )

  getOptions: (commitId) ->
    @_fetch(@baseUri + @_optionFilename(commitId)).then((res) ->
      if not res.ok
        throw new Error(
          "WebDAV getOptions failed: " + res.status)
      res.json()
    ).then((options) ->
      return {options, commitId}
    )

  pushOptions: (options, previousCommitId) ->
    newCommitId = @_generateCommitId()
    filename = @_optionFilename(newCommitId)
    jsonContent = JSON.stringify(options, null, 4)

    uploadOptions = @_fetch(@baseUri + filename, {
      method: "PUT"
      body: jsonContent
    }).then((res) ->
      if not res.ok
        throw new Error(
          "WebDAV pushOptions upload failed: " + res.status)
    )

    updateCommit = uploadOptions.then( =>
      @_fetch(@baseUri + COMMIT_FILENAME, {
        method: "PUT"
        body: newCommitId
      })
    ).then((res) ->
      if not res.ok
        throw new Error("WebDAV pushOptions commit " +
          "update failed: " + res.status)
    )

    cleanup = updateCommit.then( =>
      if previousCommitId
        @_fetch(@baseUri + @_optionFilename(previousCommitId), {
          method: "DELETE"
        }).catch(-> return)
    )

    cleanup.then( ->
      return {commitId: newCommitId}
    )

  _generateCommitId: ->
    chars = '0123456789abcdef'
    result = ''
    arr = new Uint8Array(20)
    crypto.getRandomValues(arr)
    for byte in arr
      result += chars[byte % 16]
    return result


###*
# Options backup manager: pushes/pulls the whole options object to a WebDAV
# server. The backup content matches the format of the local `.bak` file (a
# plain JSON dump of all options), so it can be restored directly.
#
# Auto backup is debounced after local options changes (when enabled).
###
class OptionsBackup
  constructor: (@options, @_state, @log) ->
    @_watchInstalled = false
    @_backupInProgress = false
    @_restoreInProgress = false
    @_suppressBackupUntil = 0
    @_timer = null

  getConfig: ->
    @_state.get({
      'optionsBackup.uri': ''
      'optionsBackup.username': ''
      'optionsBackup.password': ''
      'optionsBackup.autoBackup': false
      'optionsBackup.lastBackup': null
      'optionsBackup.lastBackupCommit': ''
      'optionsBackup.lastBackupState': ''
    }).then((raw) ->
      uri: raw['optionsBackup.uri'] or ''
      username: raw['optionsBackup.username'] or ''
      password: raw['optionsBackup.password'] or ''
      autoBackup: !!raw['optionsBackup.autoBackup']
      lastBackup: raw['optionsBackup.lastBackup'] or null
      lastBackupCommit: raw['optionsBackup.lastBackupCommit'] or ''
      lastBackupState: raw['optionsBackup.lastBackupState'] or ''
    )

  setConfig: (config = {}) ->
    updates = {}
    for key in ['uri', 'username', 'password', 'autoBackup']
      updates['optionsBackup.' + key] = config[key] if config[key]?
    @_state.set(updates)

  ###*
  # Hook options changes to schedule auto backups. `_setOptions` is the single
  # entry point for every persisted options change, so wrap it and trigger a
  # debounced backup when it is called with `persist` enabled.
  ###
  watch: ->
    return if @_watchInstalled
    @_watchInstalled = true
    origSetOptions = @options._setOptions
    @options._setOptions = (changes, args) =>
      result = origSetOptions(changes, args)
      if changes and (args?.persist ? true)
        @scheduleAutoBackup()
      result

  scheduleAutoBackup: ->
    return if @_backupInProgress or @_restoreInProgress
    return if Date.now() < @_suppressBackupUntil
    clearTimeout(@_timer) if @_timer?
    @_timer = setTimeout(=>
      @_timer = null
      @_autoBackup()
    , AUTO_BACKUP_DEBOUNCE)

  _autoBackup: ->
    return if @_backupInProgress or @_restoreInProgress
    return if Date.now() < @_suppressBackupUntil
    @getConfig().then((config) =>
      return unless config.autoBackup and config.uri
      @backupNow().catch((e) ->
        console.error('ZeroOmega: auto backup failed:', e)
      )
    ).catch((e) ->
      console.error('ZeroOmega: auto backup failed:', e)
    )

  backupNow: ->
    if @_backupInProgress
      return Promise.reject(new Error('Backup is already in progress.'))
    @_backupInProgress = true
    @getConfig().then((config) =>
      if not config.uri
        throw new Error('WebDAV URI is required.')
      @options.ready.then(=> @_pushBackup(config))
    ).then(({commitId}) =>
      @_backupInProgress = false
      @_setResult('success', commitId)
      return {commitId}
    ).catch((e) =>
      @_backupInProgress = false
      @_setResult('fail: ' + (e.message or e))
      throw e
    )

  _pushBackup: (config) ->
    data = JSON.parse(JSON.stringify(@options.getAll()))
    client = new WebDavClient()
    client.init(config)
    client.getLastCommit().then((previousCommitId) ->
      client.pushOptions(data, previousCommitId)
    )

  restore: ->
    if @_restoreInProgress
      return Promise.reject(new Error('Restore is already in progress.'))
    @_restoreInProgress = true
    @_suppressBackupUntil = Date.now() + RESTORE_SUPPRESS_TIME
    client = null
    @getConfig().then((config) ->
      if not config.uri
        throw new Error('WebDAV URI is required.')
      client = new WebDavClient()
      client.init(config)
      client.getLastCommit()
    ).then((commitId) ->
      if not commitId
        throw new Error('No backup found on the remote server.')
      client.getOptions(commitId)
    ).then(({options}) =>
      @options.reset(options)
    ).then(=>
      @_restoreInProgress = false
      @_suppressBackupUntil = Date.now() + RESTORE_SUPPRESS_TIME
      return
    ).catch((e) =>
      @_restoreInProgress = false
      throw e
    )

  _setResult: (state, commitId) ->
    updates =
      'optionsBackup.lastBackup': Date.now()
      'optionsBackup.lastBackupState': state
    updates['optionsBackup.lastBackupCommit'] = commitId if commitId
    @_state.set(updates)

module.exports = OptionsBackup
