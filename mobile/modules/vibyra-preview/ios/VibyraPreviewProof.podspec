Pod::Spec.new do |s|
  s.name = 'VibyraPreviewProof'
  s.version = '0.1.0'
  s.summary = 'Isolated iOS loopback browser transport proof'
  s.description = s.summary
  s.license = { :type => 'UNLICENSED' }
  s.author = 'Vibyra'
  s.homepage = 'https://vibyra.com'
  s.platforms = { :ios => '16.0' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.swift_version = '5.9'
  s.source_files = '**/*.swift'
end
