/** Official provider marks for the sign-in choices. Sizes inherit from CSS. */

export function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.84-.08-1.65-.21-2.43H12v4.6h6.45a5.52 5.52 0 0 1-2.39 3.62v3.01h3.88c2.27-2.09 3.55-5.17 3.55-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.93l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.27v3.1A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.26A7.21 7.21 0 0 1 4.9 12c0-.78.13-1.54.38-2.26v-3.1H1.27A11.93 11.93 0 0 0 0 12c0 1.94.46 3.78 1.27 5.36l4.01-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.79c1.76 0 3.34.61 4.59 1.8l3.43-3.43A11.46 11.46 0 0 0 12 0 11.99 11.99 0 0 0 1.27 6.64l4.01 3.1C6.23 6.9 8.88 4.79 12 4.79Z"
      />
    </svg>
  );
}

export function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M16.7 13.1c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3-1.7-1.3-.1-2.5.8-3.2.8s-1.7-.8-2.8-.7c-1.4 0-2.7.8-3.5 2.1-1.5 2.7-.4 6.6 1.1 8.7.7 1 1.6 2.2 2.7 2.1 1.1 0 1.5-.7 2.8-.7s1.7.7 2.8.7c1.2 0 1.9-1.1 2.6-2.1.8-1.2 1.1-2.3 1.1-2.4 0 0-2.4-.9-2.4-3.6ZM14.7 6.9c.6-.7 1-1.7.9-2.7-.9 0-1.9.6-2.5 1.3-.6.7-1 1.6-.9 2.6 1 0 1.9-.5 2.5-1.2Z"
      />
    </svg>
  );
}

export function EmailMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none">
      <rect
        x="3.2"
        y="5.4"
        width="17.6"
        height="13.2"
        rx="2.4"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="m4.4 7.4 7.6 5.6 7.6-5.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AuthSpinner() {
  return <span className="auth-spinner" aria-hidden="true" />;
}
