export function send(socket, message) {
  if (socket.readyState !== 1) return false;
  if (socket.bufferedAmount > 1024 * 1024) {
    socket.close(1013, 'Slow receiver');
    return false;
  }
  socket.send(JSON.stringify(message));
  return true;
}

// A frame is base64 of one Noise message: at most MAX_FRAME (61,696) bytes,
// which is 82,264 characters; the ceiling here leaves room and nothing more.
export function validFrame(value) {
  return typeof value === 'string' && value.length <= 88000 && value.length > 0 &&
    value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value);
}
