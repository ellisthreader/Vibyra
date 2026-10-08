import ctypes as c, json, hashlib, pathlib, time
x=c.CDLL('libX11.so.6');xt=c.CDLL('libXtst.so.6')
x.XOpenDisplay.restype=c.c_void_p;x.XOpenDisplay.argtypes=[c.c_char_p]
d=x.XOpenDisplay(None)
if not d:raise Exception('Private display unavailable')
class Image(c.Structure):
    _fields_=[('width',c.c_int),('height',c.c_int),('xoffset',c.c_int),('format',c.c_int),('data',c.c_void_p),('byte_order',c.c_int),('bitmap_unit',c.c_int),('bitmap_bit_order',c.c_int),('bitmap_pad',c.c_int),('depth',c.c_int),('bytes_per_line',c.c_int),('bits_per_pixel',c.c_int)]
x.XGetImage.restype=c.POINTER(Image);x.XGetImage.argtypes=[c.c_void_p,c.c_ulong,c.c_int,c.c_int,c.c_uint,c.c_uint,c.c_ulong,c.c_int]
x.XDestroyImage.argtypes=[c.POINTER(Image)];x.XFlush.argtypes=[c.c_void_p];x.XCloseDisplay.argtypes=[c.c_void_p]
x.XKeysymToKeycode.restype=c.c_uint;x.XKeysymToKeycode.argtypes=[c.c_void_p,c.c_ulong]
xt.XTestFakeMotionEvent.argtypes=[c.c_void_p,c.c_int,c.c_int,c.c_int,c.c_ulong]
xt.XTestFakeButtonEvent.argtypes=[c.c_void_p,c.c_uint,c.c_int,c.c_ulong]
xt.XTestFakeKeyEvent.argtypes=[c.c_void_p,c.c_uint,c.c_int,c.c_ulong]
info=json.loads(pathlib.Path('/tmp/project/preview-ready').read_text())
x.XGetGeometry.argtypes=[c.c_void_p,c.c_ulong,c.POINTER(c.c_ulong),c.POINTER(c.c_int),c.POINTER(c.c_int),c.POINTER(c.c_uint),c.POINTER(c.c_uint),c.POINTER(c.c_uint),c.POINTER(c.c_uint)]
x.XTranslateCoordinates.argtypes=[c.c_void_p,c.c_ulong,c.c_ulong,c.c_int,c.c_int,c.POINTER(c.c_int),c.POINTER(c.c_int),c.POINTER(c.c_ulong)]
x.XDefaultRootWindow.restype=c.c_ulong;x.XDefaultRootWindow.argtypes=[c.c_void_p]
def capture():
    root=c.c_ulong();gx=c.c_int();gy=c.c_int();width=c.c_uint();height=c.c_uint();border=c.c_uint();depth=c.c_uint()
    assert x.XGetGeometry(d,info['id'],c.byref(root),c.byref(gx),c.byref(gy),c.byref(width),c.byref(height),c.byref(border),c.byref(depth)),'Window geometry unavailable'
    assert width.value>=320 and height.value>=220,(info,width.value,height.value)
    # Capture the actual mapped rectangle, never a requested geometry assumption.
    px=c.c_int();py=c.c_int();child=c.c_ulong()
    assert x.XTranslateCoordinates(d,info['id'],root,0,0,c.byref(px),c.byref(py),c.byref(child))
    info['x']=px.value;info['y']=py.value
    image=x.XGetImage(d,root,px.value,py.value,width,height,c.c_ulong(-1),2)
    if not image:raise Exception('Window pixels unavailable')
    data=c.string_at(image.contents.data,image.contents.bytes_per_line*image.contents.height);x.XDestroyImage(image)
    if len(set(data))<3:raise Exception('Blank window')
    return hashlib.sha256(data).hexdigest()
def click(px,py):
    xt.XTestFakeMotionEvent(d,-1,info['x']+px,info['y']+py,0)
    xt.XTestFakeButtonEvent(d,1,1,0);xt.XTestFakeButtonEvent(d,1,0,0);x.XFlush(d);time.sleep(.08)
before=capture();click(100,90)
for letter in 'vm':
    code=x.XKeysymToKeycode(d,ord(letter));xt.XTestFakeKeyEvent(d,code,1,0);xt.XTestFakeKeyEvent(d,code,0,0)
x.XFlush(d);time.sleep(.08);click(100,160)
for i in range(25):
    if pathlib.Path('/tmp/project/preview-input').exists():break
    time.sleep(.04)
assert pathlib.Path('/tmp/project/preview-input').read_text()=='vm','Keyboard/click interaction failed'
assert capture()!=before,'Window pixels did not reflect the app change'
x.XCloseDisplay(d);print('PASS actual native window pixels, click and typing')
