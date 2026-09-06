from pathlib import Path
import os,subprocess,socket,urllib.request,urllib.error,json,time,signal
out=Path(__file__).parent;root=Path('/home/ellis/Desktop/Vibyra/backend');public=out/'laravel-fixture';public.mkdir(exist_ok=True);db=out/'fpm-fixture.sqlite';db.touch()
env=os.environ|{'APP_ENV':'testing','DB_CONNECTION':'sqlite','DB_DATABASE':str(db),'DB_URL':'','CACHE_STORE':'array','SESSION_DRIVER':'array','MAIL_MAILER':'array','QUEUE_CONNECTION':'sync','BCRYPT_ROUNDS':'4','APP_CONFIG_CACHE':str(out/'no-config-cache.php'),'LOG_CHANNEL':'stderr','PHPRC':'/etc/php/8.3/cli/php.ini','PHP_INI_SCAN_DIR':'/etc/php/8.3/cli/conf.d'}
bootstrap=f"require '{root}/vendor/autoload.php';$app=require '{root}/bootstrap/app.php';$app->make(Illuminate\\Contracts\\Console\\Kernel::class)->bootstrap();Illuminate\\Support\\Facades\\Http::preventStrayRequests();"
seed=out/'seed_fpm.php';seed.write_text('<?php '+bootstrap+'''Illuminate\\Support\\Facades\\Artisan::call('migrate',['--force'=>true]);
$user=App\\Models\\User::factory()->create(['email'=>'fpm-fixture@example.invalid']);
App\\Models\\VibyraSession::create(['user_id'=>$user->id,'token_hash'=>hash('sha256','isolated-fpm-fixture'),'device_name'=>'Fixture','last_used_at'=>now(),'idle_expires_at'=>now()->addHour(),'absolute_expires_at'=>now()->addDay()]);
''')
subprocess.run(['php',str(seed)],env=env,check=True,cwd=root,stdout=subprocess.DEVNULL)
(public/'index.php').write_text("<?php if (!in_array(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH),['/up','/api/session','/api/session/state','/api/session/state/delta'],true)){http_response_code(404);exit;}"+bootstrap+"$app->handleRequest(Illuminate\\Http\\Request::capture());")
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
env|={'PORT':str(port),'VIBYRA_BIND_ADDRESS':'127.0.0.1','VIBYRA_PUBLIC_DIR':str(public),'VIBYRA_NGINX_BIN':str(out/'runtime-bin/usr/sbin/nginx'),'VIBYRA_PHP_FPM_BIN':str(out/'runtime-bin/usr/sbin/php-fpm8.3')}
log=(out/'laravel-fpm.log').open('w');p=subprocess.Popen(['bash',str(root/'scripts/start-production-web.sh')],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True);base=f'http://127.0.0.1:{port}'
def request(path,body=None,token=True):
 headers={'Accept':'application/json','Content-Type':'application/json'}
 if token:headers['Authorization']='Bearer isolated-fpm-fixture'
 req=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers=headers)
 with urllib.request.urlopen(req,timeout=20) as r:return json.load(r)
try:
 for i in range(200):
  try:urllib.request.urlopen(base+'/up',timeout=2).read();break
  except Exception:
   if p.poll() is not None:raise RuntimeError('server exited')
   time.sleep(.1)
 else:raise RuntimeError('startup timeout')
 try:request('/api/session',token=False);raise AssertionError('unauthenticated session accepted')
 except urllib.error.HTTPError as e:assert e.code==401
 assert request('/api/session')['ok']
 state={'chatTitles':{'one':'  Before  '},'profileImageUri':''}
 assert request('/api/session/state',{'appState':state,'responseMode':'ack-v1'})=={'ok':True,'syncVersion':1}
 change={'path':['appState','chatTitles','one'],'beforePresent':True,'before':'  Before  ','remove':False,'value':'  After  '}
 for _ in range(2):assert request('/api/session/state/delta',{'syncVersion':1,'changes':[change]})=={'ok':True,'syncVersion':1}
 got=request('/api/session')['user']['appState'];assert got['chatTitles']['one']=='  After  ' and got['profileImageUri']==''
 bad=dict(change,value='Conflicting',before='wrong')
 try:request('/api/session/state/delta',{'syncVersion':1,'changes':[bad]});raise AssertionError('conflict accepted')
 except urllib.error.HTTPError as e:assert e.code==409
 assert request('/api/session')['user']['appState']['chatTitles']['one']=='  After  '
 (out/'laravel-fpm.json').write_text(json.dumps({'authenticatedRead':True,'unauthenticatedRejected':True,'compactSave':True,'deltaAndReplay':True,'exactWhitespace':True,'conflictPreservedRemote':True,'externalRoutesBlocked':True},indent=2))
 print('Real Laravel API through Nginx/PHP-FPM passed')
finally:
 p.send_signal(signal.SIGTERM)
 try:p.wait(timeout=15)
 except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait();raise
 log.close()
