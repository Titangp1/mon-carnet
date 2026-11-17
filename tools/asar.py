import sys,json,struct,os
f=open(sys.argv[1],'rb');d=f.read()
hs=struct.unpack('<I',d[12:16])[0];h=json.loads(d[16:16+hs]);base=8+struct.unpack('<I',d[4:8])[0]
out=sys.argv[2]
def walk(n,p):
  for k,v in n['files'].items():
    q=os.path.join(p,k)
    if 'files' in v: os.makedirs(q,exist_ok=True); walk(v,q)
    elif v.get('unpacked'): pass
    else:
      o=base+int(v['offset']); open(q,'wb').write(d[o:o+v['size']])
walk(h,out)
