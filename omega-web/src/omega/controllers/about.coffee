angular.module('omega').controller 'AboutCtrl', (
  $scope, $rootScope,$modal, omegaDebug, omegaTarget, $timeout
) ->
  $scope.update = null

  loadUpdate = (status) ->
    $scope.update = status if status

  omegaTarget.getUpdateStatus().then((status) ->
    loadUpdate(status)
    # Never checked yet (fresh install, or the server was unreachable on
    # start): look now instead of showing an empty section.
    $scope.checkUpdate() if status and not status.latest and not status.error
  )

  $scope.checkUpdate = ->
    $scope.updateChecking = true
    $scope.updateCopied = false
    omegaTarget.checkUpdateNow().then(loadUpdate).finally ->
      $scope.updateChecking = false

  $scope.copyUpdateCommand = ->
    navigator.clipboard.writeText($scope.update.command).then(->
      $scope.$apply -> $scope.updateCopied = true
    , ->
      # Clipboard access can be refused; the install guide shows the same
      # command.
      window.open($scope.update.guideUrl, '_blank')
    )

  $scope.reloadExtension = -> omegaTarget.reloadExtension()

  $scope.downloadLog = ->
    $scope.logDownloading = true
    Promise.resolve(omegaDebug.downloadLog()).then( ->
      $scope.logDownloading = false
    )
  $scope.reportIssue = ->
    $scope.issueReporting = true
    omegaDebug.reportIssue().then( ->
      $scope.issueReporting = false
    )

  $scope.showResetOptionsModal = ->
    $modal
      .open(templateUrl: 'partials/reset_options_confirm.html').result
      .then ->
        $scope.optionsReseting = true
        omegaDebug.resetOptions().then( ->
          $scope.optionsReseting = false
        )

  try
    $scope.version = omegaDebug.getProjectVersion()
  catch _
    $scope.version = '?.?.?'
