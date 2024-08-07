import parseShellBSON, { ParseMode } from '@mongodb-js/shell-bson-parser';

export function countAggregationStagesInString(source: string): number {
  const parsed = parseShellBSON(source, { mode: ParseMode.Loose });
  if (!Array.isArray(parsed)) {
    throw new Error('Source expression is not an aggregation stage array');
  }
  return parsed.length;
}
