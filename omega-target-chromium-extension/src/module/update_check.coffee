### @module omega-target-chromium-extension/update_check ###
OmegaTarget = require('omega-target')
Promise = OmegaTarget.Promise

REPO_OWNER = 'soldier-cv'
REPO_NAME = 'ZeroOmega'
GITEE_OWNER = 'huaxudong'
GITEE_REPO = 'ZeroOmega'
GITEE_BASE = 'https://gitee.com/' + GITEE_OWNER + '/' + GITEE_REPO
GITEE_API_BASE = 'https://gitee.com/api/v5/repos/' + GITEE_OWNER +
  '/' + GITEE_REPO
GITHUB_BASE = 'https://github.com/' + REPO_OWNER + '/' + REPO_NAME
GITEE_LATEST_API = GITEE_API_BASE + '/releases/latest'
GITHUB_LATEST_API = 'https://api.github.com/repos/' + REPO_OWNER +
  '/' + REPO_NAME + '/releases/latest'
GITHUB_LATEST_PAGE = GITHUB_BASE + '/releases/latest'
GITEE_RELEASES_PAGE = GITEE_BASE + '/releases'
GITHUB_RELEASES_PAGE = GITHUB_BASE + '/releases'

CHROMIUM_ASSET = 'chromium-release.zip'
FIREFOX_ASSET = 'firefox-release.zip'
ALARM = 'omega.updateCheck'
CHECK_MINUTES = 6 * 60
STARTUP_RECHECK_MINUTES = 30
NOTIFICATION_ID = 'omega.updateAvailable'
API_TIMEOUT = 6000
# Gitee 镜像落后复核用的短超时：只用来证伪"已是最新"，拿不到结果就维持原结论。
STALE_PROBE_TIMEOUT = 3000
# 下载地址完全来自远端 JSON，必须校验主机，否则被劫持的响应能让命令下载任意包。
ALLOWED_DOWNLOAD_HOSTS = [
  'gitee.com', 'github.com', 'objects.githubusercontent.com',
  'github-releases.githubusercontent.com'
]
# 两条 API 都不可用时的兜底命令：GitHub 的 /releases/latest/download/<asset>
# 不需要 tag、不依赖 API，浏览器会自己跟随 302 到最新资产。
FALLBACK_COMMAND = 'iwr https://github.com/' + REPO_OWNER + '/' + REPO_NAME +
  '/releases/latest/download/' + CHROMIUM_ASSET +
  ' -OutFile $env:TEMP\\zo.zip; Expand-Archive $env:TEMP\\zo.zip ' +
  '-DestinationPath "$env:LOCALAPPDATA\\zeroomega" -Force'

versionParts = (version) ->
  match = String(version or '').trim().match(/\d+(?:\.\d+)*/)
  return null unless match
  parts = match[0].split('.').slice(0, 3).map(Number)
  parts.push(0) while parts.length < 3
  parts

# 版本由本项目自己打 tag，形式固定；解析失败一律 false，宁可不提示也不误报。
isNewer = (remote, local) ->
  a = versionParts(remote)
  b = versionParts(local)
  return false unless a and b
  for i in [0...3]
    return a[i] > b[i] if a[i] != b[i]
  false

currentVersion = -> chrome.runtime.getManifest().version

fetchJson = (url, timeoutMs, headers) ->
  controller = new AbortController()
  timer = setTimeout((-> controller.abort()), timeoutMs)
  options = {cache: 'no-store', signal: controller.signal, redirect: 'follow'}
  options.headers = headers if headers
  fetch(url, options).then((res) ->
    throw new Error('HTTP ' + res.status) unless res.ok
    res.json()
  ).then((data) ->
    clearTimeout(timer)
    data
  ).catch((e) ->
    clearTimeout(timer)
    throw e
  )

# Releases 页面兜底只关心跟随 302 后的落地 URL，不读页面内容。
fetchFinalUrl = (url, timeoutMs, headers) ->
  controller = new AbortController()
  timer = setTimeout((-> controller.abort()), timeoutMs)
  options = {cache: 'no-store', signal: controller.signal, redirect: 'follow'}
  options.headers = headers if headers
  fetch(url, options).then((res) ->
    clearTimeout(timer)
    throw new Error('HTTP ' + res.status) unless res.ok
    res.url or url
  ).catch((e) ->
    clearTimeout(timer)
    throw e
  )

preferredAssetName = ->
  ua = ''
  try
    ua = navigator?.userAgent or ''
  catch e
    ua = ''
  if /Firefox/i.test(ua) then FIREFOX_ASSET else CHROMIUM_ASSET

pickAsset = (assets) ->
  return null unless assets?.length
  preferred = preferredAssetName()
  fallback = if preferred == CHROMIUM_ASSET
    FIREFOX_ASSET
  else
    CHROMIUM_ASSET
  for name in [preferred, fallback]
    for asset in assets
      return asset if asset?.name and String(asset.name).toLowerCase() == name
  # 兜底只接受 .zip：源码包 / sha256 不能被当成扩展包。
  for asset in assets
    return asset if asset?.name and /\.zip$/i.test(asset.name)
  null

isTrustedUrl = (raw) ->
  return false unless raw
  try
    url = new URL(raw)
  catch e
    return false
  return false unless url.protocol == 'https:'
  host = url.hostname.toLowerCase()
  for allowed in ALLOWED_DOWNLOAD_HOSTS
    suffix = '.' + allowed
    return true if host == allowed or host.slice(-suffix.length) == suffix
  false

buildCommand = (url) ->
  'iwr ' + url + ' -OutFile $env:TEMP\\zo.zip; ' +
    'Expand-Archive $env:TEMP\\zo.zip ' +
    '-DestinationPath "$env:LOCALAPPDATA\\zeroomega" -Force'

# 三条通道共用的收尾：校验 tag、比版本、挑资产、拼安装命令。
finish = (dto, source) ->
  tag = String(dto?.tag_name or '').trim()
  throw new Error(source + ' 响应里没有 tag_name') unless tag
  version = tag.replace(/^[vV]/, '')
  valid = /^\d+\.\d+\.\d+/.test(version)
  throw new Error(source + ' 的版本号非法: ' + tag) unless valid
  return null unless isNewer(version, currentVersion())
  fallbackPage = if source.indexOf('Gitee') == 0
    GITEE_RELEASES_PAGE
  else
    GITHUB_RELEASES_PAGE
  asset = pickAsset(dto.assets)
  unless asset
    throw new Error('发现新版本 ' + tag + '，但发布里没有 ' + preferredAssetName() +
      ' 附件，可访问 ' + fallbackPage)
  unless isTrustedUrl(asset.browser_download_url)
    throw new Error('下载地址不受信任，已拒绝: ' + asset.browser_download_url)
  {
    version: version
    tagName: tag
    source: source
    downloadUrl: asset.browser_download_url
    command: buildCommand(asset.browser_download_url)
    guideUrl: dto.html_url or fallbackPage
  }

tryGiteeApi = (timeoutMs) ->
  headers = {Accept: 'application/json'}
  fetchJson(GITEE_LATEST_API, timeoutMs or API_TIMEOUT, headers).then((data) ->
    finish(data, 'Gitee API')
  )

tryGithubApi = (timeoutMs) ->
  fetchJson(GITHUB_LATEST_API, timeoutMs or API_TIMEOUT, {
    Accept: 'application/vnd.github+json'
    'X-GitHub-Api-Version': '2022-11-28'
  }).then((data) -> finish(data, 'GitHub API'))

# 不走 api.github.com：跟随 /releases/latest 的 302 从落地 URL 取 tag，
# 再按命名规则拼出资产 URL。只用 CDN + HTML，完全不碰 API 限流。
tryGithubPage = ->
  fetchFinalUrl(GITHUB_LATEST_PAGE, API_TIMEOUT, {
    Accept: 'text/html,application/xhtml+xml'
  }).then((finalUrl) ->
    match = finalUrl.match(/\/releases\/tag\/([^\/?#]+)/)
    throw new Error('无法从 ' + finalUrl + ' 解析版本号') unless match
    tag = match[1]
    assetName = preferredAssetName()
    finish({
      tag_name: tag
      html_url: GITHUB_RELEASES_PAGE + '/tag/' + tag
      assets: [{
        name: assetName
        browser_download_url: GITHUB_BASE + '/releases/download/' + tag +
          '/' + assetName
      }]
    }, 'GitHub 页面')
  )

checkForUpdate = ->
  tryGiteeApi(API_TIMEOUT).then((result) ->
    return result if result
    # Gitee 说已是最新先别信：镜像同步是 continue-on-error，可能停在旧版。
    # 探测失败维持原结论——拿不到证据不等于有更新。
    tryGithubApi(STALE_PROBE_TIMEOUT).then((probe) ->
      probe or null
    ).catch(-> null)
  ).catch((e) ->
    tryGithubApi(API_TIMEOUT).catch(-> tryGithubPage())
  )

###*
# 检查发布源（Gitee 主通道 → GitHub API → Releases 页面），在浏览器启动和每
# CHECK_MINUTES 通知一次。未打包扩展不能替换自身文件，安装仍是复制命令 + 重载。
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
      'update.source': ''
      'update.checkedAt': 0
      'update.error': ''
    }).then((raw) ->
      current = currentVersion()
      latest = raw['update.latest']
      current: current
      latest: latest
      available: isNewer(latest, current)
      command: raw['update.command'] or FALLBACK_COMMAND
      checkedAt: raw['update.checkedAt'] or 0
      error: raw['update.error'] or ''
      source: raw['update.source'] or ''
      guideUrl: raw['update.guide'] or GITHUB_RELEASES_PAGE
    )

  check: ->
    checkForUpdate().then((release) =>
      if release
        @_state.set({
          'update.latest': release.version
          'update.command': release.command
          'update.guide': release.guideUrl
          'update.source': release.source
          'update.checkedAt': Date.now()
          'update.error': ''
        })
      else
        @_state.set({
          'update.latest': ''
          'update.command': FALLBACK_COMMAND
          'update.guide': GITHUB_RELEASES_PAGE
          'update.source': ''
          'update.checkedAt': Date.now()
          'update.error': ''
        })
    ).catch((e) =>
      # 发布源不可达是常态（内网 / 出国受阻），只在「关于」页显示，不打断启动。
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
