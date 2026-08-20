export const getStorageItem = (key: string): string | null => {
  return localStorage.getItem(key) || sessionStorage.getItem(key);
};

export const setStorageItem = (key: string, value: string, persist: boolean = false) => {
  if (persist) {
    sessionStorage.removeItem(key);
    localStorage.setItem(key, value);
  } else {
    localStorage.removeItem(key);
    sessionStorage.setItem(key, value);
  }
};

export const removeStorageItem = (key: string) => {
  localStorage.removeItem(key);
  sessionStorage.removeItem(key);
};

export const isPersisted = (key: string): boolean => {
  return localStorage.getItem(key) !== null;
};
