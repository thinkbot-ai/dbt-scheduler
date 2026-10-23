import { DBT_COMMANDS, ValidationError, type DbtCommand } from '@dbt-scheduler/types';
import { z } from 'zod';

const DBT_ARG_PATTERN =
  /^(?:--?[A-Za-z0-9][A-Za-z0-9_.-]*)(?:=[^\s;|&$`\\]+)?$|^[A-Za-z0-9_:+.*,/-]+$/;

export const dbtCommandSchema = z.enum(DBT_COMMANDS);

export const dbtArgumentSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => DBT_ARG_PATTERN.test(value), {
    message: 'DBT arguments must be individual tokens and cannot contain shell metacharacters',
  });

export const dbtArgumentsSchema = z.array(dbtArgumentSchema).max(64);

export function parseDbtCommand(command: string): DbtCommand {
  const parsed = dbtCommandSchema.safeParse(command);
  if (!parsed.success) {
    throw new ValidationError('Unsupported DBT command', {
      details: { command, allowed: DBT_COMMANDS },
    });
  }
  return parsed.data;
}

export function parseDbtArguments(argumentsList: readonly string[]): string[] {
  const parsed = dbtArgumentsSchema.safeParse(argumentsList);
  if (!parsed.success) {
    throw new ValidationError('Invalid DBT arguments', {
      details: { issues: parsed.error.issues.map((issue) => issue.message) },
    });
  }
  return parsed.data;
}

export function buildDbtArgv(command: string, argumentsList: readonly string[] = []): string[] {
  return [parseDbtCommand(command), ...parseDbtArguments(argumentsList)];
}
