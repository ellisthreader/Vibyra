Pod::Spec.new do |s|
  s.name = 'VibyraDiscovery'
  s.version = '1.0.0'
  s.summary = 'User-initiated Bonjour discovery for Vibyra Host'
  s.description = s.summary
  s.license = { :type => 'UNLICENSED' }
  s.author = 'Vibyra'
  s.homepage = 'https://vibyra.com'
  s.platforms = { :ios => '16.0' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Network'
  s.swift_version = '5.9'
  s.source_files = '**/*.swift'
end
