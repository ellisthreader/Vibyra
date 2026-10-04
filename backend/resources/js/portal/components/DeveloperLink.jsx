import React, { useEffect, useState } from "react";
import { developerApi } from "../developerApi.js";

/** A quiet link to the Developer page, drawn only when the server has the developer API switched on. */
export default function DeveloperLink() {
  const [on, setOn] = useState(false);
  useEffect(() => { let live = true; developerApi.overview().then(() => live && setOn(true)).catch(() => {}); return () => { live = false; }; }, []);
  return on ? <a className="portal-link-button" href="/account/developer">Developer: API keys and webhooks</a> : null;
}
