/** Routers choose other models; they are never an executable terminal model. */
export function isTerminalModel(id: string): boolean {
  const value = id.toLowerCase().replace(/^~/, '');
  return !/^(?:typesafe\/jev(?:[-/]|$)|openrouter\/(?:auto|free|bodybuilder)(?:$|:))/.test(value);
}
