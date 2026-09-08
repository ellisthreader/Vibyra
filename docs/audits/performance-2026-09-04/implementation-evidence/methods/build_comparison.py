from pathlib import Path
import os,subprocess,json,time,shutil,hashlib,sys
out=Path(__file__).parent
root=Path('/home/ellis/Desktop/Vibyra');ev=root/'docs/audits/performance-2026-09-04/implementation-evidence'
# Finish correctness checks before modifying shared build artifacts.
started=time.monotonic()
while True:
    status=json.loads((ev/'native-final-checks.json').read_text())
    if status[-1]['exit'] != 0:raise SystemExit('Native check failed; no probes built')
    if status[-1]['log']=='native-verified.log':break
    if time.monotonic()-started>1800:raise SystemExit('Native checks have not completed')
    time.sleep(2)
env=os.environ.copy()
for key in list(env):
    if key.startswith(('VIBYRA_','TAURI_')):env.pop(key,None)
env|={'CARGO_BUILD_JOBS':'2','CARGO_NET_OFFLINE':'true','TAURI_CONFIG':json.dumps({'identifier':'app.vibyra.performance.audit','productName':'Vibyra Performance Audit','build':{'frontendDist':str(out/'desktop-probe-dist')}})}
kinds=sys.argv[1:] or ['baseline','bounded']
rows=json.loads((ev/'native-ab-builds.json').read_text())[:1] if kinds==['bounded'] else []
for kind in kinds:
    shutil.copyfile(out/f'writer-{kind}.rs',out/'ab-native/crates/vibyra-core/src/pty/writer.rs')
    os.utime(out/'ab-native/crates/vibyra-core/src/pty/writer.rs',None)
    cmd=['cargo','build','--manifest-path',str(out/'ab-native/Cargo.toml'),'--locked','--offline','--features','tauri/custom-protocol']
    start=time.monotonic();logpath=ev/f'ab-{kind}-build.log'
    with logpath.open('w') as f:r=subprocess.run(cmd,cwd=root/'desktop-tauri',env=env,stdout=f,stderr=subprocess.STDOUT)
    if r.returncode:print(logpath.read_text()[-5000:],flush=True);raise SystemExit(r.returncode)
    source=Path('/mnt/nvme/home/ellis/Current-PC-Builds/cargo-target/debug/vibyra-desktop')
    shutil.copy2(source,out/f'ab-{kind}')
    row={'kind':kind,'exit':r.returncode,'seconds':time.monotonic()-start,'command':cmd,'binarySha256':hashlib.sha256((out/f'ab-{kind}').read_bytes()).hexdigest(),'writerSha256':hashlib.sha256((out/f'writer-{kind}.rs').read_bytes()).hexdigest()}
    rows.append(row);print(json.dumps(row),flush=True)
    (ev/'native-ab-builds.json').write_text(json.dumps(rows,indent=2))
assert len({row['binarySha256'] for row in rows})==2, 'Comparison binaries must differ'
(out/'ab-ready').write_text('Ready for sequential comparison')
