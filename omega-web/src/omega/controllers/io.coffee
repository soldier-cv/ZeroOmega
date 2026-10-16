angular.module('omega').controller 'IoCtrl', (
  $scope, $rootScope, omegaTarget, downloadFile
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

  saveBackupConfig = ->
    $scope.savingBackupConfig = true
    omegaTarget.setOptionsBackupConfig({
      uri: ($scope.backupConfig.uri or '').trim()
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
      $rootScope.showAlert(
        type: 'success'
        i18n: 'options_backupRestoreSuccess'
        message: 'Options restored from backup.'
      )
    ).catch(showBackupError).finally ->
      $scope.restoringBackup = false
