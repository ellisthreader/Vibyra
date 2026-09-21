// Presentation fixture only. Real Codex behavior is covered by native_cli_tests.
export function sharedCliFixture() {
  let channel: { onmessage: (value: unknown) => void } | null = null;
  let attachments = 0;
  return (command: string, args: Record<string, any>) => {
    if (command === 'shared_cli_attach') {
      if (new URLSearchParams(location.search).has('cli-fail')) throw new Error('Codex attachment unavailable in this fixture');
      channel = args.onEvent;
      document.body.dataset.cliAttaches = String(++attachments);
      channel?.onmessage({ type: 'resync', data: 'Codex CLI presentation fixture\r\n\r\n› ' });
      return { id: 1, alive: true };
    }
    if (command === 'shared_cli_write') {
      document.body.dataset.cliInput = (document.body.dataset.cliInput ?? '') + args.data;
      channel?.onmessage({ type: 'output', data: args.data });
    }
    return null;
  };
}
