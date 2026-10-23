export type ShutdownWaiter = () => Promise<NodeJS.Signals>;

export function waitForShutdownSignal(): Promise<NodeJS.Signals> {
  return new Promise((resolve) => {
    const onSignal = (signal: NodeJS.Signals): void => {
      process.removeListener('SIGTERM', onTerm);
      process.removeListener('SIGINT', onInt);
      resolve(signal);
    };
    const onTerm = (): void => {
      onSignal('SIGTERM');
    };
    const onInt = (): void => {
      onSignal('SIGINT');
    };
    process.once('SIGTERM', onTerm);
    process.once('SIGINT', onInt);
  });
}
