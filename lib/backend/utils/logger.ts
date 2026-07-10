export { logger } from "../../../lib/logger";
export type LogContext = {
  userId?: string;
  service?: string;
  action?: string;
  durationMs?: number;
  [key: string]: any;
};
