const STORAGE_KEY = "shelley-notification-prefs";

export interface NotificationPreferences {
  quietHours?: {
    enabled: boolean;
    start: string;
    end: string;
  };
  channels: {
    [channelName: string]: {
      enabled: boolean;
      events?: {
        [eventType: string]: boolean;
      };
    };
  };
}

const DEFAULT_PREFS: NotificationPreferences = {
  channels: {
    favicon: { enabled: true },
    browser: { enabled: false },
  },
};

export function getNotificationPreferences(): NotificationPreferences {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return DEFAULT_PREFS;
    }
  }
  return DEFAULT_PREFS;
}

export function setNotificationPreferences(prefs: NotificationPreferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function setChannelEnabled(channelName: string, enabled: boolean): void {
  const prefs = getNotificationPreferences();
  if (!prefs.channels[channelName]) {
    prefs.channels[channelName] = { enabled };
  } else {
    prefs.channels[channelName].enabled = enabled;
  }
  setNotificationPreferences(prefs);
}

export function isChannelEnabled(channelName: string, eventType?: string): boolean {
  const prefs = getNotificationPreferences();
  const channelPrefs = prefs.channels[channelName];
  if (!channelPrefs || !channelPrefs.enabled) return false;
  if (eventType && channelPrefs.events) {
    const eventPref = channelPrefs.events[eventType];
    if (eventPref !== undefined) return eventPref;
  }
  return true;
}

export function getQuietHours(): NonNullable<NotificationPreferences["quietHours"]> {
  return (
    getNotificationPreferences().quietHours ?? { enabled: false, start: "22:00", end: "07:00" }
  );
}

export function setQuietHours(
  quietHours: NonNullable<NotificationPreferences["quietHours"]>,
): void {
  const prefs = getNotificationPreferences();
  prefs.quietHours = quietHours;
  setNotificationPreferences(prefs);
}

export function isQuietHours(now = new Date()): boolean {
  const quiet = getQuietHours();
  if (!quiet.enabled) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const parse = (value: string) => {
    const [hours, mins] = value.split(":").map(Number);
    return hours * 60 + mins;
  };
  const start = parse(quiet.start);
  const end = parse(quiet.end);
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}
