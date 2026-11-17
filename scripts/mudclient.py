import socket,time,sys
cmds=sys.argv[1:]
s=socket.create_connection(('127.0.0.1',8084),timeout=5)
def rd(t=1.5):
    s.settimeout(t);buf=b''
    try:
        while True:
            d=s.recv(65536)
            if not d:break
            buf+=d
    except Exception: pass
    return buf.decode('utf-8','replace')
print(rd(2),flush=True)
for c in cmds:
    print('>>> '+c); s.sendall((c+'\r\n').encode('utf-8')); print(rd(float(__import__("os").environ.get("W","1.5"))),flush=True)
