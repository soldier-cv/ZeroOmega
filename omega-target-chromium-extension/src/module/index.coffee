module.exports =
  Storage: require('./storage')
  Options: require('./options')
  OptionsBackup: require('./options_backup')
  UpdateCheck: require('./update_check')
  ChromeTabs: require('./tabs')
  SwitchySharp: require('./switchysharp')
  ExternalApi: require('./external_api')
  WebRequestMonitor: require('./web_request_monitor')
  Inspect: require('./inspect')
  Url: require('url')
  proxy: require('./proxy')

for name, value of require('omega-target')
  module.exports[name] ?= value
