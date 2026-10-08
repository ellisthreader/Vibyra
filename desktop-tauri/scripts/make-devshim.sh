#!/usr/bin/env bash
# Sudo-free build shim for machines that have the GTK/WebKitGTK *runtime*
# libraries (any Ubuntu desktop) but not the -dev packages.
#
# The gtk-rs/webkit2gtk-rs -sys crates need only pkg-config metadata and
# linkable lib<name>.so names — no C headers. This generates both in a local
# prefix, pointing at the system runtime libraries.
#
# Usage:  ./scripts/make-devshim.sh
# Then:   export PKG_CONFIG_PATH="$HOME/.cache/vibyra-devshim/lib/pkgconfig"
#
# Prefer scripts/setup-linux.sh (real -dev packages) when sudo is available.
set -euo pipefail

PREFIX="${HOME}/.cache/vibyra-devshim"
PC_DIR="${PREFIX}/lib/pkgconfig"
LIB_DIR="${PREFIX}/lib"
mkdir -p "${PC_DIR}"

pkg_version() {
  # dpkg version -> upstream version (strip epoch and debian revision)
  dpkg-query -W -f '${Version}' "$1" 2>/dev/null | sed -e 's/^[0-9]*://' -e 's/-.*//' || true
}

ver_or() {
  local v
  v="$(pkg_version "$1")"
  echo "${v:-$2}"
}

GLIB_VER="$(ver_or libglib2.0-0t64 2.80.0)"
GTK_VER="$(ver_or libgtk-3-0t64 3.24.41)"
PANGO_VER="$(ver_or libpango-1.0-0 1.52.0)"
CAIRO_VER="$(ver_or libcairo2 1.18.0)"
ATK_VER="$(ver_or libatk1.0-0t64 2.52.0)"
PIXBUF_VER="$(ver_or libgdk-pixbuf-2.0-0 2.42.10)"
SOUP_VER="$(ver_or libsoup-3.0-0 3.4.4)"
WEBKIT_VER="$(ver_or libwebkit2gtk-4.1-0 2.44.0)"
DBUS_VER="$(ver_or libdbus-1-3 1.14.10)"
WAYLAND_VER="$(ver_or libwayland-client0 1.22.0)"

LDCONF="$(ldconfig -p)"

link_lib() {
  local name="$1"
  local target
  target="$(awk -v pat="lib${name}.so" 'index($1, pat) == 1 { print $NF; exit }' <<<"${LDCONF}")"
  if [ -z "${target}" ]; then
    echo "WARNING: runtime library lib${name}.so.* not found" >&2
    return 0
  fi
  ln -sf "${target}" "${LIB_DIR}/lib${name}.so"
}

for lib in glib-2.0 gobject-2.0 gio-2.0 gmodule-2.0 gthread-2.0 \
  gdk_pixbuf-2.0 pango-1.0 pangocairo-1.0 cairo cairo-gobject atk-1.0 \
  gdk-3 gtk-3 soup-3.0 javascriptcoregtk-4.1 webkit2gtk-4.1 dbus-1 \
  wayland-client wayland-cursor wayland-egl wayland-server; do
  link_lib "${lib}"
done

write_pc() {
  local module="$1" version="$2" libs="$3"
  cat >"${PC_DIR}/${module}.pc" <<EOF
prefix=${PREFIX}
libdir=\${prefix}/lib

Name: ${module}
Description: devshim for ${module} (system runtime libs)
Version: ${version}
Libs: -L\${libdir} ${libs}
Cflags:
EOF
}

GLIB_LIBS="-lglib-2.0"
GOBJECT_LIBS="-lgobject-2.0 ${GLIB_LIBS}"
GIO_LIBS="-lgio-2.0 ${GOBJECT_LIBS}"

write_pc glib-2.0 "${GLIB_VER}" "${GLIB_LIBS}"
write_pc gobject-2.0 "${GLIB_VER}" "${GOBJECT_LIBS}"
write_pc gio-2.0 "${GLIB_VER}" "${GIO_LIBS}"
write_pc gmodule-2.0 "${GLIB_VER}" "-lgmodule-2.0 ${GLIB_LIBS}"
write_pc gthread-2.0 "${GLIB_VER}" "-lgthread-2.0 ${GLIB_LIBS}"
write_pc gdk-pixbuf-2.0 "${PIXBUF_VER}" "-lgdk_pixbuf-2.0 ${GIO_LIBS}"
write_pc pango "${PANGO_VER}" "-lpango-1.0 ${GOBJECT_LIBS}"
write_pc pangocairo "${PANGO_VER}" "-lpangocairo-1.0 -lpango-1.0 -lcairo ${GOBJECT_LIBS}"
write_pc cairo "${CAIRO_VER}" "-lcairo"
write_pc cairo-gobject "${CAIRO_VER}" "-lcairo-gobject -lcairo ${GOBJECT_LIBS}"
write_pc atk "${ATK_VER}" "-latk-1.0 ${GOBJECT_LIBS}"

GDK_LIBS="-lgdk-3 -lpangocairo-1.0 -lpango-1.0 -lcairo-gobject -lcairo -lgdk_pixbuf-2.0 ${GIO_LIBS}"
write_pc gdk-3.0 "${GTK_VER}" "${GDK_LIBS}"
write_pc gdk-x11-3.0 "${GTK_VER}" "${GDK_LIBS}"
write_pc gdk-wayland-3.0 "${GTK_VER}" "${GDK_LIBS}"
write_pc gtk+-3.0 "${GTK_VER}" "-lgtk-3 -latk-1.0 ${GDK_LIBS}"

write_pc dbus-1 "${DBUS_VER}" "-ldbus-1"
write_pc wayland-client "${WAYLAND_VER}" "-lwayland-client"
write_pc wayland-cursor "${WAYLAND_VER}" "-lwayland-cursor"
write_pc wayland-egl "${WAYLAND_VER}" "-lwayland-egl"
write_pc wayland-server "${WAYLAND_VER}" "-lwayland-server"
write_pc libsoup-3.0 "${SOUP_VER}" "-lsoup-3.0 ${GIO_LIBS}"
write_pc javascriptcoregtk-4.1 "${WEBKIT_VER}" "-ljavascriptcoregtk-4.1 ${GOBJECT_LIBS}"
write_pc webkit2gtk-4.1 "${WEBKIT_VER}" \
  "-lwebkit2gtk-4.1 -ljavascriptcoregtk-4.1 -lsoup-3.0 -lgtk-3 ${GDK_LIBS}"

echo "devshim ready at ${PREFIX}"
echo "export PKG_CONFIG_PATH=\"${PC_DIR}\""
