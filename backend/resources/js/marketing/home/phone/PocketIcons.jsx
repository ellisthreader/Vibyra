import React from "react";

const shapes = {
    bolt: <path d="m14 2-9 12h6l-1 8 9-13h-6z" />,
    cloud: <path d="M7 19h11a4 4 0 0 0 .5-8A6.5 6.5 0 0 0 6 9a5 5 0 0 0 1 10Z" />,
    user: <><circle cx="12" cy="7" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2Z" /></>,
    users: <><circle cx="12" cy="7" r="3" /><path d="M6 20v-3a6 6 0 0 1 12 0v3ZM5 5a3 3 0 0 0 0 6m14-6a3 3 0 0 1 0 6M3 14a5 5 0 0 0-1 6m19-6a5 5 0 0 1 1 6" /></>,
    code: <><rect x="2" y="2" width="20" height="20" rx="4" /><path d="m8 9-3 3 3 3m8-6 3 3-3 3m-3-7-2 10" /></>,
    file: <><path d="M14 2H5v20h14V7Zm0 0v5h5M8 12h8m-8 4h6" /></>,
    chevron: <path d="m9 5 7 7-7 7" />,
    attach: <path d="m8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2m-2 15 7-7" />,
    up: <path d="M12 21V3m-7 7 7-7 7 7" />,
    home: <path d="m2 10 10-8 10 8h-3v12h-5v-8h-4v8H5V10Z" />,
    folder: <path d="M3 5h7l2 3h9v13H3Z" />,
    terminal: <><rect x="2" y="3" width="20" height="18" rx="3" /><path d="m6 9 3 3-3 3m6 0h5" /></>,
    more: <><circle cx="4" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="20" cy="12" r="1" /></>,
    wifi: <><path d="M2 8a16 16 0 0 1 20 0M6 12a10 10 0 0 1 12 0m-8 4a4 4 0 0 1 4 0" /><circle cx="12" cy="20" r=".8" /></>,
};

export default function PocketIcon({ name, className = "" }) {
    return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>;
}
