from pathlib import Path
import json,zlib,struct,itertools,io,math,hashlib
from PIL import Image
root=Path('/home/ellis/Desktop/Vibyra');out=Path(__file__).parent
records=[]
for info in json.loads((root/'docs/audits/performance-2026-09-04/evidence/asset-decode.json').read_text())['failedDecodeOrIntegrity'][4:]:
 path=info['path'];original=(root/path).read_bytes();data=original
 if data.startswith(b'\x89PNG\n\x1a\n'): data=b'\x89PNG\r\n\x1a\n'+data[7:]
 pos=8;result=data[:8];chunks=[]
 try:
  while pos<len(data):
   size=int.from_bytes(data[pos:pos+4],'big');typ=data[pos+4:pos+8];expected=pos+size+12;matches=[]
   for missing in range(20):
    end=expected-missing
    if end<len(data) and not (end+8<=len(data) and all(65<=b<=90 or 97<=b<=122 for b in data[end+4:end+8])):continue
    if end>len(data) or end<=pos+8:continue
    piece=data[pos+4:end];lfs=[i for i,b in enumerate(piece) if b==10]
    if missing>3 or math.comb(len(lfs),missing)>3000000:continue
    for places in itertools.combinations(lfs,missing):
     start=0;parts=[]
     for i in places:parts.extend([piece[start:i],b'\r']);start=i
     parts.append(piece[start:]);fixed=b''.join(parts)
     if len(fixed)==size+8 and zlib.crc32(fixed[:-4])==int.from_bytes(fixed[-4:],'big'):matches.append((end,fixed,missing))
   if len(matches)!=1:raise ValueError(f'{typ!r} at {pos}: {len(matches)} CRC-verified reconstructions')
   end,fixed,missing=matches[0];result+=struct.pack('>I',size)+fixed;chunks.append({'type':typ.decode(),'restoredBytes':missing});pos=end
  assert result.replace(b'\r\n',b'\n')==original
  Image.open(io.BytesIO(result)).verify();img=Image.open(io.BytesIO(result));img.load()
  dest=out/'recovered-legacy'/path;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(result)
  records.append({'path':path,'ok':True,'restoredBytes':len(result)-len(original),'sha256':hashlib.sha256(result).hexdigest(),'width':img.width,'height':img.height,'chunks':len(chunks)})
 except Exception as error:records.append({'path':path,'ok':False,'error':str(error)})
 print(records[-1],flush=True)
(out/'legacy-asset-recovery.json').write_text(json.dumps(records,indent=2))
