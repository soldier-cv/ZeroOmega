angular.module('omega').controller 'IoCtrl', (
  $scope, $rootScope, omegaTarget, downloadFile, $window, $filter
) ->

  tr = $filter('tr')

  $scope.backupConfig =
    uri: ''
    username: ''
    password: ''
    autoBackup: false
    syncTempRules: true

  omegaTarget.state([
    'optionsBackup.uri'
    'optionsBackup.username'
    'optionsBackup.password'
    'optionsBackup.autoBackup'
    'optionsBackup.syncTempRules'
    'optionsBackup.lastBackup'
    'optionsBackup.lastBackupState'
    'optionsBackup.lastTempRulesSync'
    'optionsBackup.lastTempRulesSyncState'
  ]).then ([uri, username, password, autoBackup, syncTempRules, lastBackup,
    lastBackupState, lastTempRulesSync, lastTempRulesSyncState]) ->
    $scope.backupConfig.uri = uri or ''
    $scope.backupConfig.username = username or ''
    $scope.backupConfig.password = password or ''
    $scope.backupConfig.autoBackup = !!autoBackup
    $scope.backupConfig.syncTempRules = syncTempRules != false
    $scope.lastBackup = lastBackup or null
    $scope.lastBackupState = lastBackupState or ''
    $scope.lastTempRulesSync = lastTempRulesSync or null
    $scope.lastTempRulesSyncState = lastTempRulesSyncState or ''
    loadBackupVersions() if $scope.backupConfig.uri

  $scope.exportOptions = ->
    $rootScope.applyOptionsConfirm().then ->
      plainOptions = angular.fromJson(angular.toJson($rootScope.options))
      content = JSON.stringify(plainOptions)
      blob = new Blob [content], {type: "text/plain;charset=utf-8"}
      filename = """ZeroOmegaOptions-#{new Date().toISOString()}.bak"""
      downloadFile(blob, filename)

  $scope.importSuccess = ->
    $rootScope.showAlert(
      type: 'success'
      i18n: 'options_importSuccess'
      message: 'Options imported.'
    )

  $scope.restoreLocal = (content) ->
    $scope.restoringLocal = true
    $rootScope.resetOptions(content).then(( ->
      $scope.importSuccess()
    ), -> $scope.restoreLocalError()).finally ->
      $scope.restoringLocal = false

  $scope.restoreLocalError = ->
    $rootScope.showAlert(
      type: 'error'
      i18n: 'options_importFormatError'
      message: 'Invalid backup file!'
    )

  $scope.triggerFileInput = ->
    angular.element('#restore-local-file').click()
    return

  # WebDAV backup / restore.

  showBackupError = (e) ->
    $rootScope.showAlert(
      type: 'error'
      message: (e and e.message) or e + ''
    )

  # input[type=url] 对 "host:port" 这类写法校验不过，Angular 会把 ng-model 置空：
  # 用户看到「已保存」，实际存的是空地址，随后备份/恢复报 "WebDAV URI is required."
  # 输入框改成 text，这里补全 scheme，让内网常见写法一次就存对。
  normalizeUri = (uri) ->
    uri = (uri or '').trim()
    return uri unless uri
    return uri if /^https?:\/\//i.test(uri)
    "http://#{uri}"

  saveBackupConfig = ->
    uri = normalizeUri($scope.backupConfig.uri)
    $scope.backupConfig.uri = uri
    $scope.savingBackupConfig = true
    omegaTarget.setOptionsBackupConfig({
      uri: uri
      username: $scope.backupConfig.username
      password: $scope.backupConfig.password
      autoBackup: !!$scope.backupConfig.autoBackup
      syncTempRules: !!$scope.backupConfig.syncTempRules
    }).finally ->
      $scope.savingBackupConfig = false

  $scope.saveBackupConfig = ->
    saveBackupConfig().then(->
      $rootScope.showAlert(
        type: 'success'
        i18n: 'options_backupSaved'
        message: 'Backup settings saved.'
      )
    ).catch(showBackupError)

  $scope.backupAutoChanged = ->
    saveBackupConfig().catch(showBackupError)

  $scope.backupNow = ->
    $scope.backingUp = true
    saveBackupConfig().then(->
      omegaTarget.backupOptionsNow()
    ).then(->
      $rootScope.showAlert(
        type: 'success'
        i18n: 'options_backupSuccess'
        message: 'Backup completed.'
      )
      # The new backup is now the latest, so show it as the one to restore.
      loadBackupVersions(true)
    ).catch(showBackupError).finally ->
      $scope.backingUp = false

  # The server keeps the last few option files; listing them lets a restore
  # pick an older copy when the newest one turned out to be a wrong (e.g.
  # default) configuration.
  #
  # The select is bound to an index, not to a commit id: Angular renders the
  # model against the option list it already has, and a string that only
  # exists in the list just assigned is dropped to null when both change in
  # one digest. An index in range is valid in either list.
  $scope.backupVersions = []
  $scope.backupVersionIndex = null
  $scope.backupVersion = null
  $scope.backupVersionsFailed = false

  versionLabel = (version) ->
    label = if version.lastModified
      $filter('date')(version.lastModified, 'medium')
    else
      version.commitId.substring(0, 8)
    label += ' · ' + tr('options_backupVersionLatest') if version.latest
    label

  latestIndex = (versions) ->
    for version, index in versions
      return index if version.latest
    0

  selectVersion = (index) ->
    $scope.backupVersionIndex = index
    $scope.backupVersion = $scope.backupVersions[index].commitId

  $scope.versionPicked = ->
    version = $scope.backupVersions[$scope.backupVersionIndex]
    $scope.backupVersion = version.commitId if version

  loadBackupVersions = (preferLatest) ->
    $scope.loadingBackupVersions = true
    $scope.backupVersionsFailed = false
    omegaTarget.listOptionsBackups().then((versions) ->
      $scope.backupVersions = versions.map((version, index) ->
        index: index
        commitId: version.commitId
        label: versionLabel(version)
      )
      if $scope.backupVersions.length
        # Keep the choice while the server still has that copy; a pruned one
        # falls back to the newest.
        index = null
        unless preferLatest
          for version, i in $scope.backupVersions
            index = i if version.commitId == $scope.backupVersion
        selectVersion(index ? latestIndex(versions))
      else
        $scope.backupVersion = null
        $scope.backupVersionIndex = null
    ).catch(->
      # Restoring still works without the list (the commit file names the
      # latest backup), so a server without PROPFIND only loses the picker.
      $scope.backupVersions = []
      $scope.backupVersion = null
      $scope.backupVersionIndex = null
      $scope.backupVersionsFailed = true
    ).finally(->
      $scope.loadingBackupVersions = false
    )

  $scope.loadBackupVersions = -> loadBackupVersions()

  $scope.restoreFromBackup = ->
    $scope.restoringBackup = true
    saveBackupConfig().then(->
      omegaTarget.restoreOptionsFromBackup($scope.backupVersion or undefined)
    ).then(->
      # 恢复是 background 侧整体替换 options（options.reset），页面持有的副本
      # 不会收到变更通知，不重载会让人以为「提示成功但没生效」。直接刷新页面，
      # 让界面等于实际配置（与从本地文件恢复的入口行为一致）。
      $window.location.reload()
    ).catch(showBackupError).finally ->
      $scope.restoringBackup = false
