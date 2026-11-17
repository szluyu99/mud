// Replacement for socket.io: talk to the FluffOS websocket port directly.
// Mimics the old node webtelnet proxy: on connect it sends the client key line,
// and relays 'stream' events both ways as UTF-8 text.
(function () {
  function Sock() {
    this.handlers = {};
    this.queue = [];
    this.open = false;
    this.connect();
  }
  Sock.prototype.on = function (ev, fn) {
    (this.handlers[ev] = this.handlers[ev] || []).push(fn);
  };
  Sock.prototype.fire = function (ev, arg) {
    (this.handlers[ev] || []).forEach(function (fn) { fn(arg); });
  };
  Sock.prototype.connect = function () {
    var self = this;
    var url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + location.pathname;
    var ws = new WebSocket(url, ['telnet']);
    ws.binaryType = 'arraybuffer';
    var dec = new TextDecoder('utf-8');
    var enc = new TextEncoder();
    self.ws = ws;
    self.enc = enc;
    ws.onopen = function () {
      self.open = true;
      ws.send(enc.encode('zjmDMaIpOvxdb\r\n'));
      self.fire('status', '服务器连接成功。\n');
      self.fire('connected');
      self.queue.forEach(function (m) { ws.send(enc.encode(m)); });
      self.queue = [];
    };
    ws.onmessage = function (e) {
      var s;
      if (typeof e.data === 'string') s = e.data;
      else {
        // strip telnet IAC sequences at the byte level, then decode UTF-8
        var b = new Uint8Array(e.data), out = [], i = 0;
        while (i < b.length) {
          if (b[i] === 255 && i + 1 < b.length) {
            var c = b[i + 1];
            if (c === 255) { out.push(255); i += 2; }
            else if (c >= 251 && c <= 254) i += 3;
            else if (c === 250) { i += 2; while (i < b.length && !(b[i] === 255 && b[i + 1] === 240)) i++; i += 2; }
            else i += 2;
          } else out.push(b[i++]);
        }
        s = dec.decode(new Uint8Array(out), { stream: true });
      }
      if (s) self.fire('stream', s);
    };
    ws.onclose = function () {
      self.open = false;
      self.fire('status', '与服务器断开连接。\n');
      self.fire('disconnect');
    };
  };
  Sock.prototype.emit = function (ev, msg) {
    if (ev !== 'stream') return;
    msg = String(msg).replace(/\n/g, '\r\n');
    if (this.open) this.ws.send(this.enc.encode(msg));
    else this.queue.push(msg);
  };
  window.io = { connect: function () { return new Sock(); } };
})();
