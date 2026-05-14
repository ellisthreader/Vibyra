export const THREE_FALLBACK_SCRIPT = `
function createThreeFallback() {
  if (window.__vibyraThreeFallback) return window.__vibyraThreeFallback;
  window.__vibyraThreeFallback = (function () {
    function V3(x, y, z) { this.x = Number(x) || 0; this.y = Number(y) || 0; this.z = Number(z) || 0; }
    V3.prototype.set = function (x, y, z) {
      this.x = Number(x) || 0; this.y = Number(y) || 0; this.z = Number(z) || 0; return this;
    };
    V3.prototype.copy = function (v) { return this.set(v && v.x, v && v.y, v && v.z); };
    V3.prototype.clone = function () { return new V3(this.x, this.y, this.z); };
    V3.prototype.add = function (v) {
      this.x += Number(v && v.x) || 0;
      this.y += Number(v && v.y) || 0;
      this.z += Number(v && v.z) || 0;
      return this;
    };
    V3.prototype.sub = function (v) {
      this.x -= Number(v && v.x) || 0; this.y -= Number(v && v.y) || 0; this.z -= Number(v && v.z) || 0; return this;
    };
    V3.prototype.multiplyScalar = function (s) {
      s = Number(s) || 0;
      this.x *= s; this.y *= s; this.z *= s; return this;
    };
    V3.prototype.length = function () {
      return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    };
    V3.prototype.normalize = function () {
      var len = this.length() || 1;
      return this.multiplyScalar(1 / len);
    };
    function Color(value) {
      this.value = value == null ? 0xffffff : value;
    }
    Color.prototype.getStyle = function () {
      if (typeof this.value === "string") return this.value;
      var hex = (Number(this.value) || 0xffffff).toString(16);
      while (hex.length < 6) hex = "0" + hex;
      return "#" + hex.slice(-6);
    };
    function Object3D() {
      this.children = [];
      this.position = new V3();
      this.rotation = new V3();
      this.scale = new V3(1, 1, 1);
      this.visible = true;
    }
    Object3D.prototype.add = function () {
      for (var i = 0; i < arguments.length; i += 1) {
        if (arguments[i]) this.children.push(arguments[i]);
      }
      return this;
    };
    Object3D.prototype.remove = function (child) {
      this.children = this.children.filter(function (item) { return item !== child; });
      return this;
    };
    Object3D.prototype.lookAt = function () { return this; };
    function Scene() { Object3D.call(this); this.background = null; }
    Scene.prototype = Object.create(Object3D.prototype);
    Scene.prototype.constructor = Scene;
    function Camera() { Object3D.call(this); this.aspect = 1; }
    Camera.prototype = Object.create(Object3D.prototype);
    Camera.prototype.constructor = Camera;
    Camera.prototype.updateProjectionMatrix = function () {};
    function Geometry(type, args) { this.type = type; this.args = args || []; }
    function Material(options) {
      options = options || {};
      this.color = options.color instanceof Color ? options.color : new Color(options.color);
      this.wireframe = Boolean(options.wireframe);
    }
    function Mesh(geometry, material) {
      Object3D.call(this);
      this.geometry = geometry || new Geometry("box", []);
      this.material = material || new Material();
    }
    Mesh.prototype = Object.create(Object3D.prototype);
    Mesh.prototype.constructor = Mesh;
    function Group() { Object3D.call(this); }
    Group.prototype = Object.create(Object3D.prototype);
    Group.prototype.constructor = Group;
    function Renderer(options) {
      options = options || {};
      var canvas = options.canvas || document.createElement("canvas");
      var context = canvas.getContext && canvas.getContext("2d");
      var clear = "#0B0D17";
      this.domElement = canvas;
      this.setSize = function (width, height) {
        canvas.width = Math.max(1, Number(width) || 1);
        canvas.height = Math.max(1, Number(height) || 1);
        canvas.style.width = canvas.width + "px";
        canvas.style.height = canvas.height + "px";
      };
      this.setPixelRatio = function () {};
      this.setClearColor = function (value) { clear = new Color(value).getStyle(); };
      this.render = function (scene) {
        if (!context) return;
        var width = canvas.width || canvas.clientWidth || 320;
        var height = canvas.height || canvas.clientHeight || 240;
        context.fillStyle = scene && scene.background && scene.background.getStyle ? scene.background.getStyle() : clear;
        context.fillRect(0, 0, width, height);
        context.fillStyle = "rgba(255,255,255,0.08)";
        for (var x = 0; x < width; x += 48) context.fillRect(x, height * 0.72, 1, height * 0.28);
        for (var y = height * 0.72; y < height; y += 24) context.fillRect(0, y, width, 1);
        drawChildren(context, scene && scene.children, width, height);
      };
    }
    function drawChildren(context, children, width, height) {
      (children || []).forEach(function (child) {
        if (!child || child.visible === false) return;
        if (child.children && child.children.length) drawChildren(context, child.children, width, height);
        if (!child.geometry || !child.material) return;
        var px = width / 2 + child.position.x * 24;
        var py = height * 0.72 + child.position.z * 24 - child.position.y * 18;
        var depth = Math.max(0.35, Math.min(1.6, 1 - child.position.z * 0.025));
        var size = Math.max(8, 28 * depth * Math.max(child.scale.x || 1, child.scale.y || 1));
        context.save();
        context.translate(px, py);
        context.fillStyle = child.material.color.getStyle();
        context.strokeStyle = "rgba(255,255,255,0.36)";
        if (/sphere/i.test(child.geometry.type)) {
          context.beginPath();
          context.arc(0, -size / 2, size / 2, 0, Math.PI * 2);
          context.fill();
        } else if (/plane/i.test(child.geometry.type)) {
          context.fillRect(-size, -2, size * 2, 4);
        } else {
          context.fillRect(-size / 2, -size, size, size);
        }
        context.stroke();
        context.restore();
      });
    }
    function Clock() {
      this.last = Date.now();
      this.getDelta = function () {
        var now = Date.now();
        var delta = Math.max(0.001, Math.min(0.1, (now - this.last) / 1000));
        this.last = now;
        return delta;
      };
    }
    function Raycaster() {
      this.setFromCamera = function () {};
      this.intersectObjects = function () { return []; };
    }
    return {
      AmbientLight: Object3D,
      BackSide: 1,
      BoxGeometry: function () { return new Geometry("box", Array.prototype.slice.call(arguments)); },
      BufferGeometry: function () { return new Geometry("buffer", Array.prototype.slice.call(arguments)); },
      Clock: Clock,
      Color: Color,
      ConeGeometry: function () { return new Geometry("cone", Array.prototype.slice.call(arguments)); },
      CylinderGeometry: function () { return new Geometry("cylinder", Array.prototype.slice.call(arguments)); },
      DirectionalLight: Object3D,
      DoubleSide: 2,
      Group: Group,
      LineBasicMaterial: Material,
      Mesh: Mesh,
      MeshBasicMaterial: Material,
      MeshLambertMaterial: Material,
      MeshStandardMaterial: Material,
      PerspectiveCamera: Camera,
      PlaneGeometry: function () { return new Geometry("plane", Array.prototype.slice.call(arguments)); },
      PointLight: Object3D,
      PointsMaterial: Material,
      Raycaster: Raycaster,
      Scene: Scene,
      SphereGeometry: function () { return new Geometry("sphere", Array.prototype.slice.call(arguments)); },
      Vector2: V3,
      Vector3: V3,
      WebGLRenderer: Renderer,
      MathUtils: { degToRad: function (value) { return Number(value) * Math.PI / 180; } }
    };
  })();
  return window.__vibyraThreeFallback;
}
function installThreeFallback() {
  if (window.__vibyraThreeFallbackInstalled) return;
  window.__vibyraThreeFallbackInstalled = true; var assigned = window.THREE;
  window.__vibyraInstallThreeFallback = function () {
    if (!assigned) {
      assigned = createThreeFallback();
      if (window.__vibyraPreviewFrameworkMissing) window.__vibyraPreviewFrameworkMissing({ name: "Three.js", url: "three.js CDN fallback" });
      else send({ type: "console", message: "Three.js was unavailable; Vibyra used a lightweight canvas fallback so the preview can still run." });
    }
    return assigned;
  };
  Object.defineProperty(window, "THREE", {
    configurable: true, get: function () { return assigned; }, set: function (value) { assigned = value; }
  });
}
installThreeFallback();
`;
