import pathlib,subprocess,os,socket,time,urllib.request,urllib.error,json,signal
out=pathlib.Path(__file__).parent;public=out/'http-fixture'
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
env=os.environ|{'PORT':str(port),'VIBYRA_BIND_ADDRESS':'127.0.0.1','VIBYRA_PUBLIC_DIR':str(public),'VIBYRA_NGINX_BIN':str(out/'runtime-bin/usr/sbin/nginx'),'VIBYRA_PHP_FPM_BIN':str(out/'runtime-bin/usr/sbin/php-fpm8.3'),'PHPRC':'/etc/php/8.3/cli/php.ini','PHP_INI_SCAN_DIR':'/etc/php/8.3/cli/conf.d'}
log=(out/'production-runtime.log').open('w');process=subprocess.Popen(['bash','backend/scripts/start-production-web.sh'],cwd='/home/ellis/Desktop/Vibyra',env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
try:
 base=f'http://127.0.0.1:{port}'
 for i in range(600):
  try:urllib.request.urlopen(base+'/up',timeout=1).read();break
  except Exception:
   if process.poll() is not None:raise RuntimeError('server exited; see production-runtime.log')
   time.sleep(.1)
 else:raise RuntimeError('startup timeout')
 start=time.perf_counter();slow=urllib.request.urlopen(base+'/slow',timeout=5);first=slow.readline();ttfb=(time.perf_counter()-start)*1000
 assert first==b'data: first\n', first
 times=[]
 for i in range(12):
  start=time.perf_counter();r=urllib.request.urlopen(base+'/up',timeout=5);assert json.load(r)['ok'];times.append((time.perf_counter()-start)*1000)
 remaining=slow.read();assert b'data: done' in remaining
 r=urllib.request.urlopen(base+'/asset.js');assert 'javascript' in r.headers['Content-Type']
 for path in ['/private.php','/.secret','/private.php/path']:
  try:urllib.request.urlopen(base+path);raise AssertionError(path)
  except urllib.error.HTTPError as error:assert error.code in [403,404]
 req=urllib.request.Request(base+'/api/session',data=b'{}',headers={'Authorization':'Bearer fixture','Content-Type':'application/json'},method='POST')
 response=json.load(urllib.request.urlopen(req));assert response['authorization']=='Bearer fixture' and response['method']=='POST'
 (out/'production-runtime.json').write_text(json.dumps({'port':port,'streamFirstLineMs':ttfb,'healthDuringStreamMs':times,'staticMime':True,'phpAndHiddenDenied':True,'authHeaderAndPostPreserved':True},indent=2))
 print('Runtime fixture passed:',len(times),'health responses while SSE was open')
finally:
 process.send_signal(signal.SIGTERM)
 try:process.wait(timeout=10)
 except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait();raise
 log.close()
 print('Runner stopped:',process.returncode)
