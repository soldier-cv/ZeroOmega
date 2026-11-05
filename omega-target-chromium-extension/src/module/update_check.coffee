### @module omega-target-chromium-extension/update_check ###
OmegaTarget = require('omega-target')
Promise = OmegaTarget.Promise

# The release endpoint CI writes on every tag from the zip it publishes
# (tools/ci/write_version_endpoint.py), so no version is hard-coded here and
# the version always matches the package that would be installed.
RES_BASE = 'http://100.64.0.88:8088'
VERSION_URL = RES_BASE + '/res/zeroomega/version.json'
GUIDE_URL = RES_BASE + '/res/zeroomega/INSTALL.md'
ALARM = 'omega.updateCheck'
CHECK_MINUTES = 6 * 60
STARTUP_RECHECK_MINUTES = 30
NOTIFICATION_ID = 'omega.updateAvailable'
# Used only when the server drops the command from its manifest; the install
# guide documents the same two steps.
FALLBACK_COMMAND = 'iwr ' +
  'http://100.64.0.88:8088/res/zeroomega/chromium-release.zip ' +
  '-OutFile $env:TEMP\\zo.zip; Expand-Archive $env:TEMP\\zo.zip ' +
  '-DestinationPath "$env:LOCALAPPDATA\\zeroomega" -Force'

numbers = (version) ->
  match = String(version or '').match(/\d+(?:\.\d+)*/)
  return null unless match
  match[0].split('.').map(Number)

# Versions look like "3.6.5" locally and "v3.6.5" (or "v3.6.5-custom") on the
# server, so only the numeric part is compared.
isNewer = (remote, local) ->
  a = numbers(remote)
  b = numbers(local)
  return false unless a and b
  for i in [0...Math.max(a.length, b.length)]
    x = a[i] or 0
    y = b[i] or 0
    return x > y if x != y
  false

###*
# Checks the release server for a newer build, on browser start and every
# CHECK_MINUTES, and tells the user through a notification. An unpacked
# extension cannot replace its own files, so installing stays a copied command
# plus a reload; this only makes sure nobody has to remember to look.
###
class UpdateCheck
  constructor: (state, log) ->
    @_state = state
    @log = log

  watch: ->
    # Re-creating an alarm resets its timer, and this runs on every service
    # worker start; only create it when it is missing.
    chrome.alarms.get ALARM, (alarm) ->
      chrome.alarms.create(ALARM, {periodInMinutes: CHECK_MINUTES}) if not alarm
    chrome.alarms.onAlarm.addListener (alarm) =>
      @check().catch(-> return) if alarm.name == ALARM
    chrome.notifications?.onClicked.addListener (id) ->
      return unless id == NOTIFICATION_ID
      chrome.notifications.clear(id)
      chrome.tabs.create(url: chrome.runtime.getURL('options.html#!/about'))
    # Opening the browser starts the worker: check then, unless a check ran
    # moments ago (the worker can also restart while the browser stays open).
    @_state.get({'update.checkedAt': 0}).then(({'update.checkedAt': at}) =>
      @check() if Date.now() - at > STARTUP_RECHECK_MINUTES * 60 * 1000
    ).catch(-> return)

  getStatus: ->
    @_state.get({
      'update.latest': ''
      'update.command': ''
      'update.guide': ''
      'update.checkedAt': 0
      'update.error': ''
    }).then((raw) ->
      current = chrome.runtime.getManifest().version
      latest = raw['update.latest']
      current: current
      latest: latest
      available: isNewer(latest, current)
      command: raw['update.command'] or FALLBACK_COMMAND
      checkedAt: raw['update.checkedAt'] or 0
      error: raw['update.error'] or ''
      guideUrl: raw['update.guide'] or GUIDE_URL
    )

  check: ->
    fetch(VERSION_URL, {cache: 'no-store'}).then((res) ->
      throw new Error('HTTP ' + res.status) unless res.ok
      res.json()
    ).then((data) =>
      guide = data?.update?.guide
      @_state.set({
        'update.latest': data?.version or ''
        'update.command': data?.update?.command or FALLBACK_COMMAND
        # The endpoint keeps URLs relative so it works under any host name.
        'update.guide': if guide then RES_BASE + guide else GUIDE_URL
        'update.checkedAt': Date.now()
        'update.error': ''
      })
    ).catch((e) =>
      # The release server sits on the LAN; being away from it is normal and
      # must not surface as an error anywhere but the about page.
      @_state.set({
        'update.checkedAt': Date.now()
        'update.error': e.message or String(e)
      })
    ).then(=> @getStatus()).then((status) =>
      @_notify(status).return(status)
    )

  # One notification per version, so a periodic check does not nag.
  _notify: (status) ->
    return Promise.resolve() unless status.available
    @_state.get({'update.notified': ''}).then(({'update.notified': seen}) =>
      return if seen == status.latest or not chrome.notifications?
      chrome.notifications.create(NOTIFICATION_ID, {
        type: 'basic'
        iconUrl: chrome.runtime.getURL('img/icons/omega-128.png')
        title: chrome.i18n.getMessage('update_notifyTitle', [status.latest])
        message: chrome.i18n.getMessage('update_notifyMessage')
      })
      @_state.set({'update.notified': status.latest})
    )

module.exports = UpdateCheck
