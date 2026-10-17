angular.module('omega').controller 'IoCtrl', (
  $scope, $rootScope, omegaTarget, downloadFile, $window
) ->

  $scope.backupConfig =
    uri: ''
    username: ''
    password: ''
    autoBackup: false

  omegaTarget.state([
    'optionsBackup.uri'
    'optionsBackup.username'
    'optionsBackup.password'
    'optionsBackup.autoBackup'
    'optionsBackup.lastBackup'
    'optionsBackup.lastBackupState'
  ]).then ([uri, username, password, autoBackup, lastBackup,
    lastBackupState]) ->
    $scope.backupConfig.uri = uri or ''
    $scope.backupConfig.username = username or ''
    $scope.backupConfig.password = password or ''
    $scope.backupConfig.autoBackup = !!autoBackup
    $scope.lastBackup = lastBackup or null
    $scope.lastBackupState = lastBackupState or ''

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
    ).catch(showBackupError).finally ->
      $scope.backingUp = false

  $scope.restoreFromBackup = ->
    $scope.restoringBackup = true
    saveBackupConfig().then(->
      omegaTarget.restoreOptionsFromBackup()
    ).then(->
      # 恢复是 background 侧整体替换 options（options.reset），页面持有的副本
      # 不会收到变更通知，不重载会让人以为「提示成功但没生效」。直接刷新页面，
      # 让界面等于实际配置（与从本地文件恢复的入口行为一致）。
      $window.location.reload()
    ).catch(showBackupError).finally ->
      $scope.restoringBackup = false
