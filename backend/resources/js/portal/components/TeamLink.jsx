import React, { useEffect, useState } from "react";
import { teamApi } from "../teamApi.js";

/** A quiet link to the Team page, drawn only when the server has Teams switched on. */
export default function TeamLink() {
  const [on, setOn] = useState(false);
  useEffect(() => { let live = true; teamApi.overview().then(() => live && setOn(true)).catch(() => {}); return () => { live = false; }; }, []);
  return on ? <a className="portal-link-button" href="/account/team">Team: members, roles and sign-in</a> : null;
}
