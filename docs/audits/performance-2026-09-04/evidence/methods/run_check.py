import sys,subprocess,time,pathlib,json,os
out=pathlib.Path(__file__).parent
label,cwd,*command=sys.argv[1:]
started=time.time()
env=os.environ.copy()
env.update({'CI':'1','CARGO_BUILD_JOBS':'2','CARGO_NET_OFFLINE':'true'})
if label.startswith('backend-tests'):
 env.update({'APP_ENV':'testing','DB_CONNECTION':'sqlite','DB_DATABASE':':memory:','DB_URL':'','CACHE_STORE':'array','SESSION_DRIVER':'array','MAIL_MAILER':'array','QUEUE_CONNECTION':'sync','APP_CONFIG_CACHE':str(out/'nonexistent-config.php')})
with (out/(label+'.log')).open('w') as log:
 p=subprocess.run(command,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT)
result={'label':label,'cwd':cwd,'command':command,'exit':p.returncode,'elapsed_seconds':round(time.time()-started,3),'started_epoch':started,'log':str(out/(label+'.log'))}
(out/(label+'.json')).write_text(json.dumps(result,indent=2))
print(json.dumps(result))
lines=(out/(label+'.log')).read_text(errors='replace').splitlines()
print('\n'.join(lines[-14:]))
sys.exit(p.returncode)
