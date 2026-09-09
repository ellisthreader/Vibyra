/** Static decoration keeps sign-in quiet and avoids a video decoder at startup. */
export function AuthBackdrop() {
  return <div className="auth__backdrop" aria-hidden="true"><span className="auth__orbit" /><span className="auth__orbit auth__orbit--inner" /></div>;
}
