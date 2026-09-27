const DEFAULT_TIMEZONE = 'Africa/Accra';
const DEFAULT_CUTOFF_HOUR = 5;

function getDateParts(date: Date, timezone: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shiftDateKey(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return dateKey(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

function timezoneOffsetMilliseconds(date: Date, timezone: string): number {
  const parts = getDateParts(date, timezone);
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    date.getUTCMilliseconds(),
  );
  return localAsUtc - date.getTime();
}

function localDateTimeToUtc(key: string, hour: number, timezone: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, hour);
  let utcTime = localAsUtc;
  utcTime = localAsUtc - timezoneOffsetMilliseconds(new Date(utcTime), timezone);
  utcTime = localAsUtc - timezoneOffsetMilliseconds(new Date(utcTime), timezone);
  return new Date(utcTime);
}

export function getBusinessDate(
  timestamp: Date | string | number,
  timezone = DEFAULT_TIMEZONE,
  cutoffHour = DEFAULT_CUTOFF_HOUR,
): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) throw new RangeError('Invalid timestamp');
  if (!Number.isInteger(cutoffHour) || cutoffHour < 0 || cutoffHour > 23) {
    throw new RangeError('cutoffHour must be an integer from 0 to 23');
  }
  const parts = getDateParts(date, timezone);
  const calendarDate = dateKey(parts.year, parts.month, parts.day);
  return parts.hour >= cutoffHour ? calendarDate : shiftDateKey(calendarDate, -1);
}

export function getBusinessDayRange(
  businessDate: string,
  timezone = DEFAULT_TIMEZONE,
  cutoffHour = DEFAULT_CUTOFF_HOUR,
): { startTime: Date; endTime: Date } {
  const [year, month, day] = businessDate.split('-').map(Number);
  if (!year || !month || !day || dateKey(year, month, day) !== businessDate) {
    throw new RangeError('businessDate must use YYYY-MM-DD');
  }
  if (!Number.isInteger(cutoffHour) || cutoffHour < 0 || cutoffHour > 23) {
    throw new RangeError('cutoffHour must be an integer from 0 to 23');
  }
  return {
    startTime: localDateTimeToUtc(businessDate, cutoffHour, timezone),
    endTime: localDateTimeToUtc(shiftDateKey(businessDate, 1), cutoffHour, timezone),
  };
}

export function shiftBusinessDate(businessDate: string, days: number): string {
  return shiftDateKey(businessDate, days);
}

export function getNextBusinessDayStart(now = new Date(), timezone = DEFAULT_TIMEZONE, cutoffHour = DEFAULT_CUTOFF_HOUR): Date {
  const businessDate = getBusinessDate(now, timezone, cutoffHour);
  return getBusinessDayRange(businessDate, timezone, cutoffHour).endTime;
}