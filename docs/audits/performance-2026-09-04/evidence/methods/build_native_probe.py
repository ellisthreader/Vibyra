import os,subprocess,json,pathlib,time
out=pathlib.Path(__file__).parent
env=os.environ.copy()
env.update({'CARGO_BUILD_JOBS':'2','CARGO_NET_OFFLINE':'true','TAURI_CONFIG':json.dumps({'identifier':'app.vibyra.performance.audit','productName':'Vibyra Performance Audit','build':{'frontendDist':str(out/'desktop-probe-dist')}})})
start=time.time()
with (out/'native-probe-build.log').open('w') as log:
 p=subprocess.run(['cargo','build','--manifest-path','src-tauri/Cargo.toml','--locked','--offline','--features','tauri/custom-protocol'],cwd='/home/ellis/Desktop/Vibyra/desktop-tauri',env=env,stdout=log,stderr=subprocess.STDOUT)
result={'exit':p.returncode,'elapsedSeconds':time.time()-start,'config':json.loads(env['TAURI_CONFIG'])}
(out/'native-probe-build.json').write_text(json.dumps(result,indent=2));print(json.dumps(result));print('\n'.join((out/'native-probe-build.log').read_text().splitlines()[-12:]))
