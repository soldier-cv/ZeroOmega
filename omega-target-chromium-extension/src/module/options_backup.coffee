### @module omega-target-chromium-extension/options_backup ###
OmegaTarget = require('omega-target')
Promise = OmegaTarget.Promise

COMMIT_FILENAME = 'zeroomega-commit.txt'
OPTION_FILE_PREFIX = 'zeroomega-'
OPTION_FILE_SUFFIX = '.json'
# Page rules live in a small file of their own: they change on popup clicks,
# far more often than options, and must never ride on a full options restore.
TEMP_RULES_FILENAME = 'zeroomega-temprules.json'
TEMP_RULES_PULL_ALARM = 'omega.tempRulesPullV2'
LEGACY_TEMP_RULES_PULL_ALARM = 'omega.tempRulesPull'
TEMP_RULES_PULL_MINUTES = 0.5
TEMP_RULES_PULL_MIN_MS = TEMP_RULES_PULL_MINUTES * 60 * 1000
TEMP_RULES_MAX_BACKOFF_MS = 5 * 60 * 1000
TEMP_RULES_PUSH_DEBOUNCE = 1000

# How many option files to keep on the server. A backup is a whole option set,
# and any device can upload its own; keeping the previous copies is the way
# back when the newest one turns out to be a wrong or default configuration.
BACKUP_VERSIONS = 3

# Debounce (ms) applied to auto backups after options change.
AUTO_BACKUP_DEBOUNCE = 2000
# Time (ms) during which auto backups are suppressed after a restore, so that
# the options re-initialization triggered by the restore does not immediately
# push a fresh backup back to the server.
RESTORE_SUPPRESS_TIME = 15000

# Inner content of every <tag> element in a DAV response body. Namespace
# prefixes vary between servers (dufs sends D:, others use a default
# namespace), so the prefix is optional in the match.
davElements = (tag, xml) ->
  regex = new RegExp(
    "<(?:[\\w.-]+:)?#{tag}[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?#{tag}>"
    'gi'
  )
  elements = []
  while match = regex.exec(xml)
    elements.push(match[1])
  elements

###*
# Minimal WebDAV client dedicated to ZeroOmega option backups.
#
# The remote layout matches the previous sync backend:
#   <uri>/zeroomega/zeroomega-commit.txt
#   <uri>/zeroomega/zeroomega-<commitId>.json
#
# Every upload is a file of its own and the newest BACKUP_VERSIONS are kept, so
# that a device with a wrong (e.g. default) configuration cannot wipe out the
# only good copy the way a single-slot backup did.
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

  pushOptions: (options) ->
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
      # The upload already succeeded. A server that cannot list the directory
      # just keeps the extra files, which is harmless; deleting the wrong one
      # would not be.
      @_pruneOptions(newCommitId).catch(-> return)
    )

    cleanup.then( ->
      return {commitId: newCommitId}
    )

  ###*
  # @returns {Promise<Array<{commitId: string, lastModified: number}>>}
  # The option files on the server, newest first. A file without a usable
  # modification time stays out of the ordering (and is never pruned), so a
  # server that does not report dates cannot make us delete the wrong copy.
  ###
  listOptions: ->
    @_fetch(@baseUri, {method: "PROPFIND", headers: {Depth: "1"}}).then(
      (res) ->
        if not res.ok
          throw new Error("WebDAV listOptions failed: " + res.status)
        res.text()
    ).then((body) ->
      versions = []
      for block in davElements('response', body)
        href = davElements('href', block)[0]
        continue unless href
        name = decodeURIComponent(href.trim()).split("/").pop()
        match = name.match(/^zeroomega-([0-9a-fA-F]+)\.json$/)
        continue unless match
        modified = davElements('getlastmodified', block)[0]
        versions.push(
          commitId: match[1]
          lastModified:
            if modified then Date.parse(modified.trim()) or 0 else 0
        )
      versions.sort((a, b) -> b.lastModified - a.lastModified)
    )

  _pruneOptions: (newCommitId) ->
    @listOptions().then((versions) =>
      # The new file is the newest by construction, so it is kept along with
      # the most recent older ones.
      keep = {}
      keep[newCommitId] = true
      for version in versions when version.lastModified
        break if Object.keys(keep).length >= BACKUP_VERSIONS
        keep[version.commitId] = true
      stale = []
      for version in versions when version.lastModified
        stale.push(version) unless keep[version.commitId]
      Promise.all(stale.map((version) =>
        @_fetch(@baseUri + @_optionFilename(version.commitId), {
          method: "DELETE"
        }).catch(-> return)
      ))
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
  # @returns {Promise<{rules: ?Object, updatedAt: number, etag: ?string,
  #                    unchanged: boolean}>}
  # An empty set when the file does not exist yet. A conditional GET keeps the
  # periodic poll cheap: dufs answers 304 with no body when nothing changed,
  # and the caller reuses the copy it last agreed with the server.
  ###
  getTempRules: (etag) ->
    options = {cache: 'no-store'}
    if etag and etag.indexOf('W/') != 0
      options.headers = {'If-None-Match': etag}
    @_fetch(@baseUri + TEMP_RULES_FILENAME, options).then((res) ->
      if res.status == 304
        return {rules: null, updatedAt: 0, etag: etag, unchanged: true}
      if res.status == 404
        return {rules: {}, updatedAt: 0, etag: null, unchanged: false}
      if not res.ok
        throw new Error("WebDAV getTempRules failed: " + res.status)
      newEtag = res.headers.get('ETag')
      res.json().then((data) ->
        rules: data?.rules or {}
        updatedAt: data?.updatedAt or 0
        etag: newEtag
        unchanged: false
      )
    )

  ###*
  # Upload the rules. With an ETag the server rejects the write (412) if
  # another device changed the file after it was read, so the caller can pull
  # again instead of overwriting.
  ###
  putTempRules: (rules, updatedAt, etag) ->
    headers = {'Content-Type': 'application/json'}
    # If-Match needs a strong ETag; a weak one never matches and would turn
    # every write into a conflict.
    headers['If-Match'] = etag if etag and etag.indexOf('W/') != 0
    @_fetch(@baseUri + TEMP_RULES_FILENAME, {
      method: 'PUT'
      headers: headers
      body: JSON.stringify({rules, updatedAt}, null, 2)
    }).then((res) ->
      return {conflict: true} if res.status == 412
      if not res.ok
        throw new Error("WebDAV putTempRules failed: " + res.status)
      return {conflict: false}
    )


sameRules = (a, b) ->
  a ?= {}
  b ?= {}
  keys = Object.keys(a)
  return false unless keys.length == Object.keys(b).length
  for key in keys
    return false unless a[key] == b[key]
  true

###*
# Three-way merge of page rules, per site. `base` is the copy last agreed with
# the server; null means this device has never synced, in which case local
# rules are added on top of the remote ones.
###
mergeTempRules = (base, local, remote) ->
  local ?= {}
  remote ?= {}
  merged = {}
  keys = {}
  keys[key] = true for own key of local
  keys[key] = true for own key of remote
  keys[key] = true for own key of base ? {}
  for own key of keys
    localValue = local[key]
    remoteValue = remote[key]
    if not base?
      value = localValue ? remoteValue
    else
      baseValue = base[key]
      localChanged = localValue != baseValue
      remoteChanged = remoteValue != baseValue
      value = if localChanged then localValue
      else if remoteChanged then remoteValue
      else baseValue
    merged[key] = value if value?
  merged

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
    @_tempRulesTimer = null
    @_tempRulesSync = null
    @_tempRulesDirty = false
    @_tempRulesEtag = null
    @_lastPullAt = 0
    @_backoffUntil = 0
    @_tempRulesFailures = 0

  getConfig: ->
    @_state.get({
      'optionsBackup.uri': ''
      'optionsBackup.username': ''
      'optionsBackup.password': ''
      'optionsBackup.autoBackup': false
      'optionsBackup.syncTempRules': true
      'optionsBackup.lastBackup': null
      'optionsBackup.lastBackupCommit': ''
      'optionsBackup.lastBackupState': ''
      'optionsBackup.syncedUri': ''
      'optionsBackup.adoptPending': ''
    }).then((raw) ->
      uri: raw['optionsBackup.uri'] or ''
      username: raw['optionsBackup.username'] or ''
      password: raw['optionsBackup.password'] or ''
      autoBackup: !!raw['optionsBackup.autoBackup']
      syncTempRules: raw['optionsBackup.syncTempRules'] != false
      lastBackup: raw['optionsBackup.lastBackup'] or null
      lastBackupCommit: raw['optionsBackup.lastBackupCommit'] or ''
      lastBackupState: raw['optionsBackup.lastBackupState'] or ''
      syncedUri: raw['optionsBackup.syncedUri'] or ''
      adoptPending: raw['optionsBackup.adoptPending'] or ''
    )

  setConfig: (config = {}) ->
    updates = {}
    for key in ['uri', 'username', 'password', 'autoBackup', 'syncTempRules']
      updates['optionsBackup.' + key] = config[key] if config[key]?
    @_state.set(updates).then(=>
      # A newly configured server is pulled right away, so rules set on other
      # devices show up without waiting for the next alarm.
      @syncTempRules(true).catch(-> return)
    ).then(=>
      # Read the server at save time as well, so the settings page can show the
      # first-contact notice right away instead of after the next change.
      @getConfig().then((cfg) =>
        return unless cfg.uri
        @_canPush(cfg).catch(-> return)
      )
    )

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
    @options.onTempRulesChanged = => @scheduleTempRulesPush()
    # The old alarm has a 10-minute period; re-creating it under the same name
    # would not change that period, so move to a new name and clear the old one.
    chrome.alarms.clear(LEGACY_TEMP_RULES_PULL_ALARM, -> return)
    # Re-creating an alarm resets its timer, and this runs on every service
    # worker start; only create it when it is missing.
    chrome.alarms.get TEMP_RULES_PULL_ALARM, (alarm) ->
      return if alarm
      chrome.alarms.create(TEMP_RULES_PULL_ALARM,
        periodInMinutes: TEMP_RULES_PULL_MINUTES)
    chrome.alarms.onAlarm.addListener (alarm) =>
      return unless alarm.name == TEMP_RULES_PULL_ALARM
      @syncTempRules().catch(-> return)
    # Startup pull: whatever other devices changed while this browser was
    # closed is in place before the first page is routed by an old rule.
    @options.ready.then(=> @syncTempRules(true)).catch(-> return)

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
      @_canPush(config).then((allowed) =>
        return unless allowed
        @backupNow().catch((e) ->
          console.error('ZeroOmega: auto backup failed:', e)
        )
      )
    ).catch((e) ->
      console.error('ZeroOmega: auto backup failed:', e)
    )

  _uriOf: (config) -> (config.uri or '').replace(/\/+$/, '')

  # Whether this browser may upload its options to the configured server.
  #
  # A browser that has never synced with this server cannot push first: its
  # options may still be the defaults, and uploading them would replace the
  # backup the other devices rely on (a single-slot backup lost it for good).
  # So the first contact only reads the server: an existing backup is reported
  # to the user, who then either restores it or uploads on purpose. An empty
  # server has nothing to protect, and the first upload becomes the baseline.
  _canPush: (config) ->
    uri = @_uriOf(config)
    return Promise.resolve(true) if config.syncedUri == uri
    # Already waiting for the user to pick a side; do not re-read the server on
    # every local change.
    return Promise.resolve(false) if config.adoptPending == uri
    client = new WebDavClient()
    client.init(config)
    client.getLastCommit().then((commitId) =>
      if commitId
        @_state.set({'optionsBackup.adoptPending': uri}).then(-> false)
      else
        @_markSynced(uri).then(-> true)
    )

  # The user settled the first contact (restore, explicit upload) or the server
  # was empty: later uploads cannot lose anything.
  _markSynced: (uri) ->
    @_state.set({
      'optionsBackup.syncedUri': uri
      'optionsBackup.adoptPending': ''
    })

  backupNow: ->
    if @_backupInProgress
      return Promise.reject(new Error('Backup is already in progress.'))
    @_backupInProgress = true
    uri = ''
    @getConfig().then((config) =>
      if not config.uri
        throw new Error('WebDAV URI is required.')
      uri = @_uriOf(config)
      @options.ready.then(=> @_pushBackup(config))
    ).then(({commitId}) =>
      @_backupInProgress = false
      # An explicit upload is a decision, so it also settles the first-contact
      # notice and the automatic backups may push freely afterwards.
      @_markSynced(uri)
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
    client.pushOptions(data)

  ###*
  # @returns {Promise<Array<{commitId: string, lastModified: number,
  #                          latest: boolean}>>}
  # The backups on the server, newest first, with the one the commit file
  # points at marked as latest. This is what the settings page lists.
  ###
  listBackups: ->
    client = null
    latestId = null
    @getConfig().then((config) ->
      if not config.uri
        throw new Error('WebDAV URI is required.')
      client = new WebDavClient()
      client.init(config)
      client.getLastCommit()
    ).then((commitId) ->
      latestId = commitId
      client.listOptions()
    ).then((versions) ->
      versions.map((version) ->
        commitId: version.commitId
        lastModified: version.lastModified
        latest: version.commitId == latestId
      )
    )

  # `commitId` selects one of the kept backups; without it the commit file
  # decides, which is what a plain "restore from backup" means.
  restore: (commitId) ->
    if @_restoreInProgress
      return Promise.reject(new Error('Restore is already in progress.'))
    if commitId and not /^[0-9a-zA-Z]+$/.test(commitId)
      return Promise.reject(new Error('Invalid backup id.'))
    @_restoreInProgress = true
    @_suppressBackupUntil = Date.now() + RESTORE_SUPPRESS_TIME
    client = null
    uri = ''
    @getConfig().then((config) =>
      if not config.uri
        throw new Error('WebDAV URI is required.')
      uri = @_uriOf(config)
      client = new WebDavClient()
      client.init(config)
      if commitId then commitId else client.getLastCommit()
    ).then((commitId) ->
      if not commitId
        throw new Error('No backup found on the remote server.')
      client.getOptions(commitId)
    ).then(({options}) =>
      @options.reset(options)
    ).then(=>
      @_restoreInProgress = false
      @_suppressBackupUntil = Date.now() + RESTORE_SUPPRESS_TIME
      # The local options are the server's copy now, so a later upload cannot
      # lose anything and the first-contact notice is settled.
      @_markSynced(uri)
    ).catch((e) =>
      @_restoreInProgress = false
      throw e
    )

  # ---- Page rule (temp rule) sync -----------------------------------------
  #
  # Every change is pull → merge → push; each device also pulls on start and
  # every TEMP_RULES_PULL_MINUTES. The merge is three-way per site against
  # the copy last agreed with the server ('tempRulesBase'): a site this device
  # did not touch takes the remote value, a site only this device changed
  # keeps the local value, and when both changed the same site the local
  # click wins, since it is the newest intent the user expressed here. The
  # PUT carries If-Match, so a write that raced another device is retried on
  # top of the newer file instead of overwriting it.

  scheduleTempRulesPush: ->
    @_tempRulesDirty = true
    clearTimeout(@_tempRulesTimer) if @_tempRulesTimer?
    @_tempRulesTimer = setTimeout(=>
      @_tempRulesTimer = null
      @syncTempRules(true).catch((e) ->
        console.error('ZeroOmega: page rule sync failed:', e)
      )
    , TEMP_RULES_PUSH_DEBOUNCE)

  syncTempRules: (force = false) ->
    # Back off periodic polls after a failure; a local edit, a settings save or
    # a manual sync still goes through, so a user action is never held up.
    return Promise.resolve() if not force and Date.now() < @_backoffUntil
    @_lastPullAt = Date.now()
    # One sync at a time; a change made during a sync triggers another one.
    if @_tempRulesSync
      return @_tempRulesSync.then(=>
        @syncTempRules(force) if @_tempRulesDirty
      )
    @_tempRulesSync = @_syncTempRulesOnce(3).finally(=>
      @_tempRulesSync = null
    )

  # Popup opens and window focus must not duplicate the alarm: skip when any
  # sync already ran within one period.
  pullIfStale: ->
    recent = Date.now() - @_lastPullAt < TEMP_RULES_PULL_MIN_MS
    return Promise.resolve() if recent
    @syncTempRules().catch(-> return)

  _syncTempRulesOnce: (attemptsLeft) ->
    client = null
    @getConfig().then((config) =>
      return null unless config.uri and config.syncTempRules
      client = new WebDavClient()
      client.init(config)
      @options.ready.then(=>
        Promise.join(
          client.getTempRules(@_tempRulesEtag)
          @_state.get({tempRulesBase: null})
          (remote, {tempRulesBase}) -> {remote, base: tempRulesBase}
        )
      )
    ).then((ctx) =>
      return unless ctx
      @_tempRulesDirty = false
      local = @options.exportTempRules()
      base = ctx.base
      if ctx.remote.unchanged
        # A 304 says the server still holds the version we last read, which is
        # tempRulesBase (kept in step on every successful sync). With no base
        # the ETag cannot be trusted: drop it and read the file again.
        if not base
          @_tempRulesEtag = null
          return @_syncTempRulesOnce(attemptsLeft)
        remote = base
      else
        remote = ctx.remote.rules
        @_tempRulesEtag = ctx.remote.etag
      merged = mergeTempRules(base, local, remote)
      tasks = []
      unless sameRules(merged, local)
        tasks.push(@options.replaceTempRules(merged, notify: false))
      if sameRules(merged, remote)
        tasks.push(@_state.set({tempRulesBase: merged}))
        return Promise.all(tasks).then(=> @_setTempRulesResult('success'))
      Promise.all(tasks).then(->
        client.putTempRules(merged, Date.now(), ctx.remote.etag)
      ).then(({conflict}) =>
        if conflict
          throw new Error('WebDAV page rules changed during sync.') if (
            attemptsLeft <= 1)
          return @_syncTempRulesOnce(attemptsLeft - 1)
        @_state.set({tempRulesBase: merged}).then(=>
          @_setTempRulesResult('success')
        )
      )
    ).catch((e) =>
      @_tempRulesDirty = true
      @_tempRulesFailures += 1
      @_backoffUntil = Date.now() + Math.min(
        TEMP_RULES_PULL_MIN_MS * Math.pow(2, @_tempRulesFailures),
        TEMP_RULES_MAX_BACKOFF_MS)
      @_setTempRulesResult('fail: ' + (e.message or e)).then(-> throw e)
    )

  _setTempRulesResult: (state) ->
    if state == 'success'
      @_tempRulesFailures = 0
      @_backoffUntil = 0
    @_state.set({
      'optionsBackup.lastTempRulesSync': Date.now()
      'optionsBackup.lastTempRulesSyncState': state
    })

  _setResult: (state, commitId) ->
    updates =
      'optionsBackup.lastBackup': Date.now()
      'optionsBackup.lastBackupState': state
    updates['optionsBackup.lastBackupCommit'] = commitId if commitId
    @_state.set(updates)

module.exports = OptionsBackup
module.exports.mergeTempRules = mergeTempRules
