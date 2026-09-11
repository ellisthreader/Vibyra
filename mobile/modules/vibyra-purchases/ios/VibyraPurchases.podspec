Pod::Spec.new do |s|
  s.name = 'VibyraPurchases'
  s.version = '1.0.0'
  s.summary = 'StoreKit purchases for Vibyra AI credits'
  s.description = s.summary
  s.license = { :type => 'UNLICENSED' }
  s.author = 'Vibyra'
  s.homepage = 'https://vibyra.app'
  s.platforms = { :ios => '16.0' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'StoreKit'
  s.swift_version = '5.9'
  s.source_files = '**/*.swift'
end
