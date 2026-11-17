import sys,os,json,struct,hashlib
src,out=sys.argv[1],sys.argv[2];blobs=[];off=[0]
def integ(b):
  bs=4*1024*1024;return {"algorithm":"SHA256","hash":hashlib.sha256(b).hexdigest(),"blockSize":bs,"blocks":[hashlib.sha256(b[i:i+bs]).hexdigest() for i in range(0,max(len(b),1),bs)]}
def walk(p):
  n={}
  for k in sorted(os.listdir(p)):
    q=os.path.join(p,k)
    if os.path.isdir(q): n[k]={"files":walk(q)}
    else:
      b=open(q,'rb').read();n[k]={"size":len(b),"offset":str(off[0]),"integrity":integ(b)};blobs.append(b);off[0]+=len(b)
  return n
h=json.dumps({"files":walk(src)},separators=(',',':')).encode()
pad=(4-len(h)%4)%4;pk=struct.pack('<II',4+len(h)+pad,len(h))+h+b'\0'*pad
with open(out,'wb') as f:
  f.write(struct.pack('<II',4,len(pk)));f.write(pk)
  for b in blobs:f.write(b)
